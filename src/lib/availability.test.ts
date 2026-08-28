import assert from "node:assert/strict";
import { test } from "node:test";
import offersFile from "../../data/offers.json";
import { loadCatalog } from "./catalog";
import { availableRacketIds, offersCatalogSchema } from "./offers";
import { prefilter } from "./prefilter";
import type { Answers } from "./answers";

/**
 * Invariant tests, not snapshot tests: `data/offers.json` is rewritten weekly
 * by the refresh workflow, so asserting exact counts would fail on data
 * changes that are perfectly healthy. What must hold regardless of the data:
 * the availability set mirrors the offers file's own rules, and the pt-BR
 * pool survives the prefilter's harshest answer combinations with enough
 * candidates to recommend from.
 */

const offers = offersCatalogSchema.parse(offersFile).offers;
const mlIds = availableRacketIds("mercadolivre");

test("every Mercado Livre offer is in the set exactly unless variant_spec", () => {
  for (const offer of offers.filter((o) => o.store === "mercadolivre")) {
    assert.equal(
      mlIds.has(offer.racketId),
      offer.matchKind !== "variant_spec",
      `${offer.racketId} (${offer.matchKind})`,
    );
  }
});

test("the availability set only contains racquets the catalog knows", () => {
  const catalogIds = new Set(loadCatalog().map((r) => r.id));
  for (const id of mlIds) {
    assert.ok(catalogIds.has(id), `${id} has an offer but no catalog entry`);
  }
});

test("the pt-BR pool is large enough to recommend from at all", () => {
  // 3 is the prefilter's hard floor; 10 is its relax threshold. A pool that
  // cannot clear the relax threshold unfiltered means coverage regressed badly.
  assert.ok(mlIds.size >= 10, `only ${mlIds.size} racquets available in BR`);
});

const brPool = loadCatalog().filter((r) => mlIds.has(r.id));

/** The prefilter's harshest hard-filter combinations (see lib/prefilter.ts). */
const WORST_CASES: { name: string; answers: Answers }[] = [
  {
    name: "beginner with an active arm injury",
    answers: { skill: "beginner", armInjury: "current" },
  },
  {
    name: "beginner with a racquet-powered swing",
    answers: { skill: "beginner", armInjury: "none", swing: "racquet-power" },
  },
  {
    name: "injured player wanting a light frame",
    answers: {
      skill: "intermediate",
      armInjury: "current",
      specKnowledge: "yes",
      weightSpec: "under-285",
      fitness: 2,
    },
  },
];

for (const { name, answers } of WORST_CASES) {
  test(`pt-BR pool survives the prefilter: ${name}`, () => {
    const candidates = prefilter(answers, brPool);
    assert.ok(
      candidates.length >= 3,
      `${name}: only ${candidates.length} candidates`,
    );
    for (const r of candidates) {
      assert.ok(mlIds.has(r.id), `${r.id} recommended but not available in BR`);
    }
  });
}
