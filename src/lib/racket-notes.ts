import { z } from "zod";
import notesFile from "../../data/racket-notes.json";
import type { Locale } from "@/i18n/routing";

/**
 * Per-racquet prose, written once by `scripts/notes.ts` and served statically.
 *
 * Its own file rather than a field on `rackets.json`: the scraper rewrites the
 * catalog wholesale on every refresh, and prose that takes a model call and a
 * human read to produce cannot live somewhere a cron job truncates. Keying by
 * `racketId` means a refresh that drops or renames a frame leaves an orphan
 * note, which the test catches, instead of silently losing the text.
 *
 * What the prose may say is constrained at generation time, not here — see the
 * system prompt and the lint in `scripts/notes.ts`. Everything in it has to be
 * derivable from the catalog specs, because the site has never played any of
 * these racquets and saying otherwise on 272 pages would be a lie at scale.
 */

const localeNoteSchema = z.object({
  paragraphs: z.array(z.string().min(1)).min(1),
});

export const racketNoteSchema = z.object({
  racketId: z.string().min(1),
  generatedAt: z.string(),
  /** Flipped by hand after a spot-check; the page does not gate on it. */
  reviewed: z.boolean(),
  /** Model slug that wrote it, so a prompt change is traceable in the diff. */
  model: z.string().min(1),
  locales: z.object({
    "pt-BR": localeNoteSchema,
    en: localeNoteSchema,
  }),
});

export type RacketNote = z.infer<typeof racketNoteSchema>;

export const racketNotesFileSchema = z.object({
  version: z.number(),
  updatedAt: z.string(),
  notes: z.array(racketNoteSchema),
});

export type RacketNotesFile = z.infer<typeof racketNotesFileSchema>;

/**
 * Claims the prose may never make, checked twice: once on generation and once
 * by the test over the committed file. The second pass is the point — the JSON
 * is a hand-editable artifact, and the rule that matters ("we have not played
 * these racquets") has to survive someone improving a sentence by hand.
 */
const BANNED_CLAIMS: [RegExp, string][] = [
  [/\b(testei|testamos|testada?s?\s+por|playtest\w*)\b/i, "claims testing"],
  [
    /\b(jogadores|usuári[oa]s|clientes)\s+\w*\s*(relatam|dizem|reportam|afirmam|elogiam)/i,
    "claims user feedback",
  ],
  [
    /\b(players|users|reviewers?|testers?)\s+\w*\s*(report|say|note|praise|find)/i,
    "claims user feedback",
  ],
  [/\breview(s|ers|ed)?\b/i, "references reviews"],
  [/\b(no|do)\s+circuito\b|\bon tour\b|\bATP\b|\bWTA\b/i, "claims tour use"],
  [/\b(profissionais|pros)\s+\w*\s*(usam|use|jogam|play)/i, "claims professional use"],
  [/\bmais vendid[ao]\b|\bbest.?sell\w*\b/i, "claims sales figures"],
  [/\bprêmi[oa]\b|\baward\w*\b/i, "claims awards"],
  [/\b(a\s+)?melhor raquete\b|\bbest racquet\b/i, "superlative ranking claim"],
  [/R\$|US\$|\$\s?\d|\bpreç|\bprice\b|\bcost\w*\b/i, "mentions price"],
];

/** The first banned claim in `text`, described, or null when it is clean. */
export function findBannedClaim(text: string): string | null {
  for (const [pattern, label] of BANNED_CLAIMS) {
    const hit = text.match(pattern);
    if (hit) return `${label} ("${hit[0]}")`;
  }
  return null;
}

let cached: Map<string, RacketNote> | null = null;

/**
 * Per-note `safeParse`, not one strict parse of the whole file.
 *
 * Unlike the catalog, this file is model output: 272 records that a generation
 * run writes one at a time. Parsing it as a unit means a single malformed
 * entry — an empty paragraph, a half-written record from an interrupted run —
 * throws inside a server component and 500s every racquet page, including the
 * 271 whose prose is fine. Dropping the bad record instead costs one section
 * on one page.
 *
 * Strictness lives in `racket-notes.test.ts`, which parses the committed file
 * whole and fails the build. That is the right place for it: a malformed note
 * should stop a deploy, not a visitor.
 */
function index(): Map<string, RacketNote> {
  if (cached) return cached;

  const raw = notesFile as { notes?: unknown[] };
  cached = new Map();
  for (const entry of raw.notes ?? []) {
    const parsed = racketNoteSchema.safeParse(entry);
    if (parsed.success) cached.set(parsed.data.racketId, parsed.data);
  }
  return cached;
}

/** Every racquet id with prose, for the test that guards against orphans. */
export function racketNoteIds(): string[] {
  return [...index().keys()];
}

/**
 * When this racquet's prose was written, or null when it has none.
 *
 * The sitemap needs it: a racquet page's content is the catalog scrape *and*
 * the note, so a page whose prose landed after the last scrape has changed
 * since the date `catalogUpdatedAt` would claim. Understating `lastModified`
 * on the 272 pages this layer exists to improve is the one thing that would
 * delay them being recrawled.
 */
export function racketNoteGeneratedAt(racketId: string): Date | null {
  const note = index().get(racketId);
  return note ? new Date(note.generatedAt) : null;
}

/**
 * The paragraphs for one racquet in one locale, or `null` when the racquet has
 * no note yet. Null is a normal state: generation runs in batches, and a page
 * without prose renders without the section rather than with an empty heading.
 */
export function getRacketNotes(
  racketId: string,
  locale: Locale,
): string[] | null {
  return index().get(racketId)?.locales[locale].paragraphs ?? null;
}
