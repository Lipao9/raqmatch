/**
 * Writes the per-racquet prose in `data/racket-notes.json`.
 *
 *   npm run notes                      # every racquet still without a note
 *   npm run notes -- --limit 10        # the first 10 of those (calibration run)
 *   npm run notes -- --only wilson-blade-98-16x19-v10,head-speed-mp-2026
 *   npm run notes -- --force --limit 5 # rewrite notes that already exist
 *
 * Needs ANTHROPIC_API_KEY. Resumable by construction: the default run skips
 * racquets that already have a note and the file is rewritten after every
 * completion, so an interrupted run loses at most the calls in flight.
 *
 * The whole point of this file is that the site has 272 catalog pages whose
 * only prose is four template sentences from `racketTraits`, and 272 pages
 * built from one template is what "low value content" means. So the prose has
 * to be genuinely per-racquet — and it has to be true. The site has never hit
 * a ball with any of these frames.
 *
 * That constraint is enforced three times over, because a model asked for 272
 * short reviews will happily invent playtests:
 *
 *   1. The prompt carries specs and nothing else — no marketing copy, no model
 *      year narrative, no review text. What is not in `facts` cannot be
 *      grounded in anything.
 *   2. The system prompt bans the claim types outright.
 *   3. `lint()` re-checks the output and rejects any banned phrase, any price,
 *      and — the load-bearing one — ANY numeral that was not in `facts`. A
 *      fabricated spec is the failure mode that would actually mislead a
 *      buyer, and it is the one a human spot-check is least likely to notice.
 *
 * A rejected generation is retried once with the violation quoted back, then
 * reported and skipped. Skipping is safe: a racquet without a note renders
 * without the section.
 */
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { loadCatalog, specRanges, type Racket } from "../src/lib/catalog";
import {
  findBannedClaim,
  racketNotesFileSchema,
  type RacketNote,
} from "../src/lib/racket-notes";
import { racketTraits } from "../src/lib/traits";
import { weightFor } from "../src/lib/weight";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const LIMIT = Number(flag("limit") ?? Infinity);
const ONLY = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const FORCE = args.includes("--force");
const CONCURRENCY = Number(flag("concurrency") ?? 6);

const MODEL = "claude-opus-5";
const NOTES_PATH = new URL("../data/racket-notes.json", import.meta.url);
const PARAGRAPHS = 3;

// ---------------------------------------------------------------------------
// Facts: everything the model is allowed to know about the racquet.
// ---------------------------------------------------------------------------

/**
 * Share of the catalog this racquet sits above, rounded to 5. Rounded because
 * "heavier than 73% of the catalog" is false precision on a 272-frame sample
 * that is itself a snapshot of one retailer, and because every number in here
 * becomes quotable — see `allowedNumbers`.
 */
function percentile(values: number[], value: number): number {
  const below = values.filter((v) => v < value).length;
  return Math.round((below / values.length) * 20) * 5;
}

function facts(racket: Racket): Record<string, unknown> {
  const catalog = loadCatalog();
  const ranges = specRanges();
  const traits = racketTraits(racket).map((t) => t.key);
  // Both conventions, because the two locales quote different ones and the
  // gap between them is the single most useful thing this site can tell a
  // Brazilian reader about a US-sourced spec sheet.
  const unstrung = weightFor(racket, "pt-BR");

  const nums = (pick: (r: Racket) => number | null) =>
    catalog.map(pick).filter((v): v is number => v !== null);

  return {
    brand: racket.brand,
    model: racket.model,
    catalog_size: catalog.length,
    head_size_in2: racket.headSizeIn2,
    head_size_percentile: percentile(nums((r) => r.headSizeIn2), racket.headSizeIn2),
    head_size_catalog_range: [ranges.headSize.min, ranges.headSize.max],
    strung_weight_g: racket.weightGrams,
    strung_weight_percentile: percentile(nums((r) => r.weightGrams), racket.weightGrams),
    strung_weight_catalog_range: [ranges.weight.min, ranges.weight.max],
    unstrung_weight_g: unstrung.grams,
    unstrung_weight_is_estimated: !unstrung.exact,
    balance: racket.balance || null,
    balance_points: racket.balancePoints,
    stiffness_ra: racket.stiffnessRA,
    stiffness_percentile:
      racket.stiffnessRA === null
        ? null
        : percentile(nums((r) => r.stiffnessRA), racket.stiffnessRA),
    stiffness_catalog_range: [ranges.stiffness.min, ranges.stiffness.max],
    swingweight: racket.swingweight,
    swingweight_percentile:
      racket.swingweight === null
        ? null
        : percentile(nums((r) => r.swingweight), racket.swingweight),
    swingweight_catalog_range: [ranges.swingweight.min, ranges.swingweight.max],
    string_pattern: racket.stringPattern,
    traits_the_site_already_shows: traits,
  };
}

// ---------------------------------------------------------------------------
// Prompt.
// ---------------------------------------------------------------------------

const SYSTEM = `You write the spec analysis that sits on a tennis racquet page at RaqMatch, a bilingual (pt-BR / en) racquet-matching site.

You are given a JSON object of catalog specifications for one racquet, including where each spec falls against the whole catalog. That object is the ONLY thing you know about this racquet. Write ${PARAGRAPHS} paragraphs per language explaining what that combination of numbers means for a player.

What each paragraph does:
1. What the specs add up to — the kind of frame this is, reading the numbers together rather than one at a time.
2. Who it suits and who it does not, argued from the specs.
3. The trade-off or caveat the specs imply (comfort, string life, stability, the demand it puts on technique). Only where the specs support one.

Hard rules — these exist because the site has never played any of these racquets:
- NEVER claim testing, playtesting, reviews, user or player feedback, sales figures, awards, or professional/tour use. No "players report", "we tested", "reviewers note".
- NEVER state a number that is not in the given facts. Not a price, not a tension, not a year, not a spec you inferred. If you want to say a frame is heavy, say it is heavy or cite the percentile you were given.
- NEVER mention prices or currency.
- Do not compare against other named racquets or earlier versions of this one. You were not given them.
- Stiffness (RA), swingweight or balance may be missing from the facts. If so, say nothing about them — do not guess.

This text is published directly below the page's own spec table, which already lists every number with a scale. So:
- Do NOT open by restating the specs. The reader has just read them. Open on what they mean.
- Cite a percentile at most twice in the whole piece. Everywhere else compare in words — "among the heaviest in the catalog", "a smaller head than most here".
- Vary the opening. This runs on hundreds of pages, and a recurring formula ("Read together, the numbers…", "Somando os números…") turns them all back into one template. Start somewhere the specs of THIS frame suggest.

Voice: plain and specific, never hype. You are explaining a spec sheet to someone deciding whether to buy, not selling it to them. No exclamation marks, no "perfeita para você", no marketing adjectives. It is fine — good, even — to say the frame is demanding, or that it will not suit most players.

Language conventions, and they differ:
- pt-BR quotes the UNSTRUNG weight (unstrung_weight_g), because that is what Brazilian stores publish. If unstrung_weight_is_estimated is true, present it as approximate ("cerca de", "aproximadamente").
- en quotes the STRUNG weight (strung_weight_g), the convention of the US catalog the specs come from.
- Every percentile you were given was computed on the catalog's STRUNG weights. So in pt-BR never attach a percentile or a catalog comparison to the unstrung gram figure — the two conventions are ~17 g apart and pinning one to the other is precisely the confusion this site exists to clear up. Compare the frame's weight in words instead.
- Head size is written "in²" in both languages, the unit the rest of the site uses. Not "pol²".
- The two versions are the same analysis for the same reader in two languages, not a translation exercise: write each one natively. Neither should read as translated.

55 to 85 words per paragraph.`;

/**
 * The paragraph count is a range, not `.length(PARAGRAPHS)`. Structured output
 * constrains the shape of the JSON, not the length of an array, so an exact
 * bound is enforced client-side — and a model that splits one paragraph in two
 * would throw away an otherwise good generation. The prompt asks for
 * `PARAGRAPHS`; this just keeps the result within sight of it.
 */
const outputSchema = z.object({
  ptBR: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(`The ${PARAGRAPHS} paragraphs in Brazilian Portuguese.`),
  en: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(`The ${PARAGRAPHS} paragraphs in English.`),
});

// ---------------------------------------------------------------------------
// Lint.
// ---------------------------------------------------------------------------

/** Every numeral the facts authorise, as the strings they would be written as. */
function allowedNumbers(factsObj: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  for (const match of JSON.stringify(factsObj).matchAll(/\d+(?:\.\d+)?/g)) {
    const n = match[0];
    found.add(n);
    // The catalog holds 97.5 in2; pt-BR writes it 97,5. Same number, and the
    // decimal separator must not be what fails the lint.
    if (n.includes(".")) found.add(n.replace(".", ","));
  }
  return found;
}

/** Shortest a paragraph can be and still have said something. */
const MIN_PARAGRAPH_CHARS = 80;

function lint(
  paragraphs: string[],
  allowed: Set<string>,
): string | null {
  // Observed: a model that has said everything it has to say will pad the
  // array with an empty string rather than return a shorter one. Dropping
  // those is right; a stub sentence left in a page is not.
  if (paragraphs.length < 2) return `only ${paragraphs.length} paragraph(s)`;
  const short = paragraphs.find((p) => p.length < MIN_PARAGRAPH_CHARS);
  if (short !== undefined) return `paragraph too short: "${short.slice(0, 40)}"`;

  const text = paragraphs.join("\n\n");

  const banned = findBannedClaim(text);
  if (banned) return banned;

  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const raw = match[0];
    if (allowed.has(raw) || allowed.has(raw.replace(",", "."))) continue;
    return `numeral "${raw}" is not in the specs`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

const client = new Anthropic();

interface Usage {
  input: number;
  cacheRead: number;
  output: number;
}

const usageTotal: Usage = { input: 0, cacheRead: 0, output: 0 };

/** Opus 5 list price, USD per million tokens. Cache reads bill at ~0.1x input. */
const PRICE = { input: 5, cacheRead: 0.5, output: 25 };

function spentUSD(u: Usage): number {
  return (
    (u.input * PRICE.input +
      u.cacheRead * PRICE.cacheRead +
      u.output * PRICE.output) /
    1_000_000
  );
}

async function generate(racket: Racket): Promise<RacketNote> {
  const factsObj = facts(racket);
  const allowed = allowedNumbers(factsObj);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Specifications for ${racket.brand} ${racket.model}:\n\n${JSON.stringify(factsObj, null, 2)}`,
    },
  ];

  let lastViolation = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM,
          // Identical on all 272 calls. Only bites above the model's minimum
          // cacheable prefix; below it this is a no-op, not an error.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      output_config: { format: zodOutputFormat(outputSchema) },
    });

    usageTotal.input += response.usage.input_tokens;
    usageTotal.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    // Thinking tokens bill as output, so this is the real driver of the run's
    // cost — worth printing, because a full catalog pass is 272 of these.
    usageTotal.output += response.usage.output_tokens;

    const raw = response.parsed_output;
    if (!raw) throw new Error("no parsed output");
    const parsed = {
      ptBR: raw.ptBR.map((p) => p.trim()).filter(Boolean),
      en: raw.en.map((p) => p.trim()).filter(Boolean),
    };

    const violation =
      lint(parsed.ptBR, allowed) ?? lint(parsed.en, allowed);
    if (!violation) {
      return {
        racketId: racket.id,
        generatedAt: new Date().toISOString(),
        reviewed: false,
        model: response.model,
        locales: {
          "pt-BR": { paragraphs: parsed.ptBR },
          en: { paragraphs: parsed.en },
        },
      };
    }

    lastViolation = violation;
    // Feed the violation back rather than resampling blind: the second attempt
    // then knows which sentence to drop.
    messages.push(
      { role: "assistant", content: JSON.stringify(parsed) },
      {
        role: "user",
        content: `That draft breaks a hard rule: ${violation}. Rewrite both languages without it. Every number you write must appear in the specifications above.`,
      },
    );
  }

  throw new Error(`failed lint twice: ${lastViolation}`);
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

function readNotes(): Map<string, RacketNote> {
  const file = racketNotesFileSchema.parse(
    JSON.parse(readFileSync(NOTES_PATH, "utf8")),
  );
  return new Map(file.notes.map((n) => [n.racketId, n]));
}

/** Sorted by id so a regenerated batch is a readable diff, not a reshuffle. */
function writeNotes(notes: Map<string, RacketNote>): void {
  const sorted = [...notes.values()].sort((a, b) =>
    a.racketId.localeCompare(b.racketId),
  );
  writeFileSync(
    NOTES_PATH,
    `${JSON.stringify(
      { version: 1, updatedAt: new Date().toISOString(), notes: sorted },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  const notes = readNotes();
  const catalog = loadCatalog();

  let queue = ONLY
    ? catalog.filter((r) => ONLY.includes(r.id))
    : catalog.filter((r) => FORCE || !notes.has(r.id));
  if (ONLY) {
    const missing = ONLY.filter((id) => !catalog.some((r) => r.id === id));
    if (missing.length > 0) throw new Error(`unknown racquet ids: ${missing.join(", ")}`);
  }
  queue = queue.slice(0, LIMIT);

  console.log(
    `${queue.length} racquets to write (${notes.size}/${catalog.length} already done), ${MODEL}, concurrency ${CONCURRENCY}`,
  );
  if (queue.length === 0) return;

  let done = 0;
  const failures: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const racket = queue[cursor++];
      try {
        notes.set(racket.id, await generate(racket));
        // After every completion: 272 calls is long enough that a crash or a
        // rate limit two hours in must not cost the whole run.
        writeNotes(notes);
        console.log(`  [${++done}/${queue.length}] ${racket.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${racket.id}: ${message}`);
        console.log(`  [${++done}/${queue.length}] ${racket.id} — FAILED: ${message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );

  console.log(
    `\n${notes.size}/${catalog.length} racquets have notes` +
      ` | ${usageTotal.input} in (+${usageTotal.cacheRead} cached) / ${usageTotal.output} out tokens` +
      ` | about US$ ${spentUSD(usageTotal).toFixed(2)} at list price`,
  );
  if (failures.length > 0) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures) console.log(`  ${f}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
