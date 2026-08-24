#!/usr/bin/env bash
#
# Opens (or updates) the pull request carrying a data refresh.
#
# A pull request rather than a push to main: these files decide which racquet a
# buy button points at and what price it claims, and a bad match is not visible
# in production until someone clicks it. It also matches how everything else in
# this repo lands.
#
# One long-lived branch per kind, force-pushed. A weekly job that opened a fresh
# pull request every run would leave fifty-two of them a year, and reviewing the
# fifth stale one is how a wrong price gets merged by fatigue.
set -euo pipefail

KIND="${1:?usage: open-data-pr.sh <offers|catalog>}"
BRANCH="data/refresh-${KIND}"

if git diff --quiet -- data/; then
  echo "No data changes — nothing to open."
  exit 0
fi

# Computed against HEAD while the new files are still uncommitted, so the body
# describes this run rather than the diff of the reused branch.
SUMMARY=$(node -e '
const { execSync } = require("node:child_process");
const fs = require("node:fs");

const read = (path) => {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return null; }
};
const readHead = (path) => {
  try { return JSON.parse(execSync(`git show HEAD:${path}`, { encoding: "utf8" })); }
  catch { return null; }
};

const lines = [];

const before = readHead("data/offers.json")?.offers ?? [];
const after = read("data/offers.json")?.offers ?? [];
if (before.length || after.length) {
  const key = (o) => `${o.racketId}::${o.store}`;
  const was = new Map(before.map((o) => [key(o), o]));
  const now = new Map(after.map((o) => [key(o), o]));
  const added = [...now.keys()].filter((k) => !was.has(k));
  const dropped = [...was.keys()].filter((k) => !now.has(k));
  const repriced = [...now.entries()].filter(
    ([k, o]) => was.has(k) && was.get(k).priceBRL !== o.priceBRL,
  );
  lines.push(`**Offers** — ${before.length} → ${after.length}`);
  lines.push(`- ${added.length} added, ${dropped.length} dropped, ${repriced.length} repriced`);
  for (const [k, o] of repriced.slice(0, 15)) {
    lines.push(`  - \`${k.split("::")[0]}\`: ${was.get(k).priceBRL} → ${o.priceBRL}`);
  }
  if (repriced.length > 15) lines.push(`  - …and ${repriced.length - 15} more`);
  for (const k of dropped.slice(0, 15)) {
    lines.push(`  - dropped \`${k.split("::")[0]}\` — no live listing or no longer matched`);
  }
}

const cBefore = readHead("data/rackets.json");
const cAfter = read("data/rackets.json");
const count = (c) => (Array.isArray(c) ? c.length : (c?.rackets?.length ?? 0));
if (count(cBefore) !== count(cAfter)) {
  lines.push("", `**Catalog** — ${count(cBefore)} → ${count(cAfter)} racquets`);
}

console.log(lines.join("\n"));
')

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "$BRANCH"
git add data/
git commit -m "Refresh ${KIND} data

$SUMMARY"
git push --force origin "$BRANCH"

BODY="Automated ${KIND} refresh from \`${GITHUB_WORKFLOW:-local}\`.

${SUMMARY}

Nothing here was reviewed by a human yet. The matcher only writes a row when at
least two specs agree and the product has a live listing, but that is a floor,
not a guarantee — spot-check any racquet whose title looks off before merging."

if gh pr view "$BRANCH" --json number >/dev/null 2>&1; then
  gh pr edit "$BRANCH" --body "$BODY"
  echo "Updated existing pull request."
else
  gh pr create \
    --head "$BRANCH" \
    --title "Refresh ${KIND} data" \
    --body "$BODY"
fi
