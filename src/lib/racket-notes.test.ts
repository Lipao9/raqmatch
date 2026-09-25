import assert from "node:assert/strict";
import { test } from "node:test";
import { getRacketBySlug, loadCatalog } from "./catalog";
import notesFile from "../../data/racket-notes.json";
import { findBannedClaim, racketNotesFileSchema } from "./racket-notes";

const notes = racketNotesFileSchema.parse(notesFile).notes;

const LOCALES = ["pt-BR", "en"] as const;

test("every note belongs to a racquet still in the catalog", () => {
  // The scraper rewrites rackets.json monthly. A dropped or renamed frame
  // leaves prose pointing at nothing, which is silent in the UI — the page
  // just stops showing a section — so it has to be loud here.
  for (const note of notes) {
    assert.ok(
      getRacketBySlug(note.racketId),
      `unknown racquet id "${note.racketId}"`,
    );
  }
});

test("notes are unique per racquet and complete in both locales", () => {
  const seen = new Set<string>();
  for (const note of notes) {
    assert.ok(!seen.has(note.racketId), `duplicate note: ${note.racketId}`);
    seen.add(note.racketId);
    for (const locale of LOCALES) {
      const paragraphs = note.locales[locale].paragraphs;
      assert.ok(
        paragraphs.length >= 2,
        `${note.racketId} (${locale}): only ${paragraphs.length} paragraph(s)`,
      );
      for (const paragraph of paragraphs) {
        assert.ok(
          paragraph.trim().length >= 80,
          `${note.racketId} (${locale}): paragraph too short to say anything`,
        );
      }
    }
  }
});

test("no note claims anything the site cannot stand behind", () => {
  for (const note of notes) {
    for (const locale of LOCALES) {
      const claim = findBannedClaim(note.locales[locale].paragraphs.join("\n"));
      assert.equal(claim, null, `${note.racketId} (${locale}): ${claim}`);
    }
  }
});

test("no paragraph is reused across racquets", () => {
  // The reason this whole layer exists is that 272 pages sharing one template
  // read as thin content. Prose that repeats verbatim on two frames would
  // reintroduce exactly that, one paragraph at a time.
  const seen = new Map<string, string>();
  for (const note of notes) {
    for (const locale of LOCALES) {
      for (const paragraph of note.locales[locale].paragraphs) {
        const key = paragraph.trim().toLowerCase();
        const owner = seen.get(key);
        assert.equal(
          owner,
          undefined,
          `${note.racketId} repeats a paragraph from ${owner} (${locale})`,
        );
        seen.set(key, note.racketId);
      }
    }
  }
});

test("catalog coverage is reported", () => {
  // Not an assertion on completeness: generation runs in batches and a partial
  // file is a valid state. This just keeps the number visible in test output,
  // so a half-finished run cannot quietly ship as if it were done.
  console.log(
    `  racket notes: ${notes.length}/${loadCatalog().length} racquets`,
  );
});
