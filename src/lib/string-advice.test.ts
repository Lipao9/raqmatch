import assert from "node:assert/strict";
import { test } from "node:test";
import type { Racket } from "./catalog";
import {
  stringAdviceFor,
  stringProfileFromAnswers,
  tensionFor,
} from "./string-advice";
import { getStringOffer, loadStrings } from "./strings";

/**
 * Invariant tests over the curated catalog, in the same spirit as
 * availability.test.ts: the string catalog is hand-edited, so what must hold
 * are the promises the advice engine makes regardless of which strings are in
 * the file — an injured arm never sees stiff poly, tension maths stay sane,
 * and the two data files agree.
 */

const racket = (over: Partial<Racket> = {}): Racket => ({
  id: "test-racket",
  brand: "Test",
  model: "Frame 100",
  headSizeIn2: 100,
  weightGrams: 300,
  balance: "4 pts HL",
  balancePoints: -4,
  stiffnessRA: 65,
  stringPattern: "16x19",
  swingweight: 320,
  priceUSD: 200,
  imageUrl: "https://example.com/x.png",
  productUrl: "https://example.com/x",
  ...over,
});

test("an active arm injury never gets stiff poly, at any rank", () => {
  const profile = stringProfileFromAnswers({ armInjury: "current" });
  assert.equal(profile.armCare, "strict");
  for (const pick of stringAdviceFor(racket(), profile).picks) {
    assert.notEqual(pick.string.category, "poly", pick.string.id);
  }
});

test("a competitive spin player gets a spin poly on top", () => {
  const profile = stringProfileFromAnswers({
    skill: "competitive",
    spinStyle: "heavy-topspin",
    armInjury: "none",
  });
  const top = stringAdviceFor(racket(), profile).picks[0];
  assert.equal(top.string.category, "poly");
  assert.ok(top.string.tags.includes("spin"), top.string.id);
});

test("a beginner gets a multifilament on top, not poly", () => {
  const profile = stringProfileFromAnswers({
    skill: "beginner",
    armInjury: "none",
  });
  const top = stringAdviceFor(racket(), profile).picks[0];
  assert.equal(top.string.category, "multi", top.string.id);
});

test("poly is strung looser than multi on the same frame", () => {
  const r = racket();
  assert.ok(tensionFor(r, "poly").lbs[0] < tensionFor(r, "multi").lbs[0]);
});

test("tension ranges are ordered, humane and consistent across head sizes", () => {
  for (const headSizeIn2 of [95, 98, 100, 104]) {
    for (const category of ["poly", "multi"] as const) {
      const { lbs, kg } = tensionFor(racket({ headSizeIn2 }), category);
      assert.ok(lbs[0] < lbs[1]);
      assert.ok(kg[0] < kg[1]);
      assert.ok(lbs[0] >= 40 && lbs[1] <= 62, `${headSizeIn2} ${category}`);
    }
  }
  // Bigger head, tighter bed.
  assert.ok(
    tensionFor(racket({ headSizeIn2: 104 }), "poly").lbs[0] >
      tensionFor(racket({ headSizeIn2: 95 }), "poly").lbs[0],
  );
});

test("advice always fills its picks and never repeats a string", () => {
  const profiles = [
    undefined,
    stringProfileFromAnswers({}),
    stringProfileFromAnswers({ skill: "advanced", powerControl: 1 }),
    stringProfileFromAnswers({ skill: "beginner", powerControl: 5 }),
    stringProfileFromAnswers({ armInjury: "current", skill: "competitive" }),
  ];
  for (const profile of profiles) {
    for (const headSizeIn2 of [93, 98, 100, 107]) {
      const { picks } = stringAdviceFor(racket({ headSizeIn2 }), profile);
      assert.equal(picks.length, 3);
      assert.equal(new Set(picks.map((p) => p.string.id)).size, 3);
    }
  }
});

test("every curated string has a Mercado Livre offer", () => {
  // Not a schema rule — a string without an offer is legal and degrades to a
  // search link — but today's catalog was curated FROM availability, so a
  // missing offer means a mapping row was lost, not a decision was made.
  for (const s of loadStrings()) {
    assert.ok(getStringOffer(s.id), `${s.id} has no offer`);
  }
});
