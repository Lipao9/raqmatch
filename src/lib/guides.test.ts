import assert from "node:assert/strict";
import { test } from "node:test";
import { getRacketBySlug } from "./catalog";
import { GUIDES, guideLastModified } from "./guides";

// The registry is hand-maintained; these are the guards the catalog itself
// gets from Zod. A broken content import is caught by `next build` instead
// (literal dynamic imports are resolved statically), so it is not tested here.

test("guide slugs are unique and url-safe", () => {
  const seen = new Set<string>();
  for (const guide of GUIDES) {
    assert.match(guide.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, guide.slug);
    assert.ok(!seen.has(guide.slug), `duplicate slug: ${guide.slug}`);
    seen.add(guide.slug);
  }
});

test("guide dates parse and never place updatedAt before publishedAt", () => {
  for (const guide of GUIDES) {
    assert.ok(
      !Number.isNaN(guideLastModified(guide).getTime()),
      `${guide.slug}: bad date`,
    );
    if (guide.updatedAt) {
      assert.ok(
        new Date(guide.updatedAt) >= new Date(guide.publishedAt),
        `${guide.slug}: updatedAt before publishedAt`,
      );
    }
  }
});

test("every related racquet id resolves in the catalog", () => {
  for (const guide of GUIDES) {
    for (const id of guide.relatedRacquetIds) {
      assert.ok(
        getRacketBySlug(id),
        `${guide.slug}: unknown racquet id "${id}"`,
      );
    }
  }
});
