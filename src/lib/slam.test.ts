import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getActiveSlam,
  slamThemeScript,
  SLAM_WINDOWS,
  THEME_WINDOWS,
} from "./slam";

test("main-draw dates activate their slam", () => {
  assert.equal(getActiveSlam(new Date(2026, 0, 25)), "australian-open");
  assert.equal(getActiveSlam(new Date(2026, 4, 30)), "roland-garros");
  assert.equal(getActiveSlam(new Date(2026, 6, 5)), "wimbledon");
  assert.equal(getActiveSlam(new Date(2026, 8, 3)), "us-open");
});

test("qualifying week counts, the day before it does not", () => {
  // US Open 2026 main draw starts Aug 31; the theme goes up 6 days earlier.
  assert.equal(getActiveSlam(new Date(2026, 7, 25)), "us-open");
  assert.equal(getActiveSlam(new Date(2026, 7, 24)), null);
});

test("last day counts, the day after does not", () => {
  assert.equal(getActiveSlam(new Date(2026, 8, 13)), "us-open");
  assert.equal(getActiveSlam(new Date(2026, 8, 14)), null);
});

test("off-season falls back to Monte-Carlo", () => {
  // Mid-April is, fittingly, Monte-Carlo Masters week.
  assert.equal(getActiveSlam(new Date(2026, 3, 15)), null);
  assert.equal(getActiveSlam(new Date(2026, 10, 10)), null);
});

test("lead-extended windows never overlap", () => {
  const sorted = [...THEME_WINDOWS].sort((a, b) =>
    a.start < b.start ? -1 : 1,
  );
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      sorted[i - 1].end < sorted[i].start,
      `${sorted[i - 1].slam} overlaps ${sorted[i].slam}`,
    );
  }
});

test("inline script embeds every window and stays inert markup", () => {
  const script = slamThemeScript();
  for (const w of SLAM_WINDOWS) {
    assert.ok(script.includes(`"${w.slam}"`), w.slam);
  }
  // Injected via dangerouslySetInnerHTML: must never close its own tag.
  assert.ok(!script.includes("</"));
});
