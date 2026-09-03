import assert from "node:assert/strict";
import { test } from "node:test";
import type { Racket } from "./catalog";
import { InsufficientCandidatesError, prefilter } from "./prefilter";

let seq = 0;
function racket(overrides: Partial<Racket>): Racket {
  seq += 1;
  return {
    id: `test-racket-${seq}`,
    brand: `Brand${seq}`, // unique per racket so the brand cap never interferes
    model: `Model ${seq}`,
    headSizeIn2: 100,
    weightGrams: 300,
    balance: "4 pts HL",
    balancePoints: -4,
    stiffnessRA: 65,
    stringPattern: "16x19",
    swingweight: 320,
    priceUSD: 200,
    imageUrl: "https://example.com/r.png",
    productUrl: "https://example.com/r",
    ...overrides,
  };
}

/** Enough neutral frames that the relax loop never fires unless a test wants it. */
function fillers(n: number): Racket[] {
  return Array.from({ length: n }, () => racket({}));
}

test("active arm injury is never relaxed away", () => {
  const stiff = Array.from({ length: 12 }, () =>
    racket({ stiffnessRA: 70 }),
  );
  assert.throws(
    () => prefilter({ armInjury: "current" }, stiff),
    InsufficientCandidatesError,
  );

  const soft = Array.from({ length: 3 }, () =>
    racket({ stiffnessRA: 62, weightGrams: 300 }),
  );
  const tooLight = racket({ stiffnessRA: 60, weightGrams: 280 });
  const survivors = prefilter({ armInjury: "current" }, [
    ...stiff,
    ...soft,
    tooLight,
  ]);
  assert.deepEqual(
    survivors.map((r) => r.id).sort(),
    soft.map((r) => r.id).sort(),
    "only soft, heavy-enough frames survive an active injury",
  );
});

test("a racquet-powered swing shifts the skill weight band down", () => {
  const light = Array.from({ length: 10 }, () =>
    racket({ weightGrams: 285, headSizeIn2: 102 }),
  );
  const atOldBandEdge = racket({ weightGrams: 296, headSizeIn2: 102 });
  const survivors = prefilter(
    { skill: "beginner", swing: "racquet-power" },
    [...light, atOldBandEdge],
  );
  // Beginner band is [0,300]; racquet-power shifts it to [0,290].
  assert.ok(!survivors.some((r) => r.id === atOldBandEdge.id));
});

test("competitive level filters out light and low-swingweight frames", () => {
  const specFrames = Array.from({ length: 10 }, () =>
    racket({ weightGrams: 318, swingweight: 325 }),
  );
  // 295g strung ≈ 280g unstrung — the frame that triggered this rule.
  const tooLight = racket({ weightGrams: 295, swingweight: 303 });
  // Heavy on the scale but swings like a lighter frame.
  const lowSW = racket({ weightGrams: 312, swingweight: 305 });
  // Unknown swingweight is not held against a heavy-enough frame.
  const noSW = racket({ weightGrams: 315, swingweight: null });

  const survivors = prefilter({ skill: "competitive" }, [
    ...specFrames,
    tooLight,
    lowSW,
    noSW,
  ]);
  const ids = new Set(survivors.map((r) => r.id));
  assert.ok(!ids.has(tooLight.id), "295g strung is below the competitive floor");
  assert.ok(!ids.has(lowSW.id), "SW 305 is below the competitive floor");
  assert.ok(ids.has(noSW.id), "unknown swingweight still passes");
});

test("racquet-power never lowers the advanced/competitive floor", () => {
  const specFrames = Array.from({ length: 10 }, () =>
    racket({ weightGrams: 318, swingweight: 325 }),
  );
  // Would pass a [300, ∞] band if the -10 shift applied to competitive.
  const light = racket({ weightGrams: 302, swingweight: 320 });
  const survivors = prefilter(
    { skill: "competitive", swing: "racquet-power" },
    [...specFrames, light],
  );
  assert.ok(!survivors.some((r) => r.id === light.id));
});

test("weightSpec band filters in strung grams", () => {
  const inBand = Array.from({ length: 10 }, () =>
    racket({ weightGrams: 298 }), // ~282g unstrung
  );
  const outOfBand = racket({ weightGrams: 320 });
  const survivors = prefilter(
    { specKnowledge: "yes", weightSpec: "under-285" },
    [...inBand, outOfBand],
  );
  assert.ok(!survivors.some((r) => r.id === outOfBand.id));
});

test("low fitness caps racquet weight", () => {
  const manageable = Array.from({ length: 10 }, () =>
    racket({ weightGrams: 300 }),
  );
  const heavy = racket({ weightGrams: 320 });
  const survivors = prefilter({ fitness: 1 }, [...manageable, heavy]);
  assert.ok(!survivors.some((r) => r.id === heavy.id));

  const strong = prefilter({ fitness: 4 }, [...manageable, heavy]);
  assert.ok(strong.some((r) => r.id === heavy.id));
});

test("scale answers rank by distance from neutral", () => {
  const powerFrame = racket({
    headSizeIn2: 104,
    stiffnessRA: 70,
    stringPattern: "16x19",
  });
  const controlFrame = racket({
    headSizeIn2: 98,
    stiffnessRA: 62,
    stringPattern: "18x20",
  });
  const pool = [controlFrame, powerFrame, ...fillers(10)];

  const wantsPower = prefilter({ powerControl: 5 }, pool);
  assert.equal(wantsPower[0].id, powerFrame.id);

  const wantsControl = prefilter({ powerControl: 1 }, pool);
  assert.equal(wantsControl[0].id, controlFrame.id);

  // Neutral means zero influence: original order is preserved (stable sort).
  const neutral = prefilter({ powerControl: 3 }, pool);
  assert.equal(neutral[0].id, controlFrame.id);
});

test("struggles are normalised so more boxes never outweigh one", () => {
  // Matches low-power on every criterion (head>=100, RA>=67, open): 4 points.
  const powerFix = racket({
    headSizeIn2: 102,
    stiffnessRA: 68,
    stringPattern: "16x19",
    swingweight: 318,
  });
  // Matches only off-center (head>=102): 2 points.
  const forgiving = racket({
    headSizeIn2: 104,
    stiffnessRA: 60,
    stringPattern: "18x20",
    weightGrams: 310,
  });
  const pool = [forgiving, powerFix, ...fillers(10)];

  // Alone, low-power puts the power frame first…
  const one = prefilter({ struggles: ["low-power"] }, pool);
  assert.equal(one[0].id, powerFix.id);

  // …and diluting it across three selections halves-plus its contribution
  // ((4+0+0)/3 ≈ 1.33 vs forgiving's (0+2+0)/3 ≈ 0.67): order still holds,
  // but "nothing" contributes zero for everyone.
  const nothing = prefilter({ struggles: ["nothing"] }, pool);
  assert.equal(nothing[0].id, forgiving.id, "stable order under zero score");
});
