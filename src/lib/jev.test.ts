import assert from "node:assert/strict";
import { test } from "node:test";
import type { Racket } from "./catalog";
import {
  buildQuestions,
  buildState,
  combine,
  dimensionWeights,
  fallbackRanking,
  freeText,
  questionKey,
  type JevAnswers,
} from "./jev";

let seq = 0;
function racket(overrides: Partial<Racket> = {}): Racket {
  seq += 1;
  return {
    id: `test-racket-${seq}`,
    brand: `Brand${seq}`,
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

test("only the dimensions the answers make relevant are asked", () => {
  assert.deepEqual(dimensionWeights({ skill: "intermediate" }), { power: 1 });
  assert.deepEqual(dimensionWeights({ struggles: ["nothing"], style: "not-sure" }), {
    power: 1,
  });

  const w = dimensionWeights({
    struggles: ["flies-long"],
    armInjury: "current",
    style: "serve-volley",
    improveGoals: "Quero parar de mandar a bola longa",
  });
  assert.deepEqual(w, { power: 1, control: 2, arm: 2, style: 1, goals: 1.5 });
});

test("arm dimension weighs by how present the injury is", () => {
  assert.equal(dimensionWeights({ armInjury: "current" }).arm, 2);
  assert.equal(dimensionWeights({ armInjury: "past" }).arm, 1.5);
  assert.equal(dimensionWeights({ armInjury: "occasional" }).arm, 1.5);
  assert.equal(
    dimensionWeights({ armInjury: "none", struggles: ["arm-fatigue"] }).arm,
    1,
  );
  assert.equal(dimensionWeights({ armInjury: "none" }).arm, undefined);
});

test("free text below a dozen characters is a shrug, not a goal", () => {
  assert.deepEqual(freeText({ improveGoals: "nada" }), {});
  assert.deepEqual(freeText({ improveGoals: "  Ser mais agressivo   na rede " }), {
    improveGoals: "Ser mais agressivo na rede",
  });
  assert.equal(dimensionWeights({ anythingElse: "ok" }).goals, undefined);
});

test("one question per candidate per applicable dimension, keyed and named by id", () => {
  const cands = [racket({ id: "a-1" }), racket({ id: "b-2" })];
  const q = buildQuestions(cands, { power: 1, arm: 2 });
  assert.deepEqual(Object.keys(q).sort(), [
    "arm:a-1",
    "arm:b-2",
    "power:a-1",
    "power:b-2",
  ]);
  for (const [key, question] of Object.entries(q)) {
    assert.equal(question.type, "noul");
    assert.ok(question.instructions.includes(key.split(":")[1]), key);
    assert.ok(question.criteria.true.length > 20 && question.criteria.false.length > 20);
  }
});

test("state spells out enum answers, keeps the player's words, and tags every spec with a class", () => {
  const cands = [
    racket({ id: "soft", stiffnessRA: 60, weightGrams: 290, swingweight: 305 }),
    racket({ id: "stiff", stiffnessRA: 70, weightGrams: 315, swingweight: 330, balancePoints: 2 }),
  ];
  const state = buildState(
    cands,
    {
      skill: "beginner",
      swing: "racquet-power",
      struggles: ["low-power", "off-center"],
      armInjury: "current",
      powerControl: 4,
      currentRacquet: "",
      improveGoals: "Quero ganhar mais pontos na rede",
    },
    "en",
  ) as {
    player: Record<string, unknown>;
    weight_convention: string;
    candidates: Record<string, unknown>[];
  };

  assert.equal(state.player.skill_level, "beginner, learning the fundamentals");
  assert.deepEqual(state.player.reported_problems, [
    "shots come out weak or short (lacks power)",
    "mishits outside the sweet spot a lot",
  ]);
  assert.equal(state.player.control_vs_power_preference, "4/5 (leaning total power)");
  assert.equal(state.player.arm_care, "strict");
  assert.equal(state.player.current_racquet, undefined, "empty answers are dropped");
  assert.deepEqual(state.player.in_their_own_words, {
    wants_to_improve: "Quero ganhar mais pontos na rede",
  });
  assert.equal(state.weight_convention, "strung grams");

  const [soft, stiff] = state.candidates;
  assert.equal(soft.id, "soft");
  assert.equal(soft.stiffness_class, "flexible");
  assert.equal(soft.weight_class, "light");
  assert.equal(soft.swingweight_class, "low (manoeuvrable, less plow-through)");
  assert.equal(soft.balance_class, "head-light");
  assert.equal(stiff.stiffness_class, "stiff");
  assert.equal(stiff.weight_class, "heavy");
  assert.equal(stiff.balance_class, "head-heavy");
  assert.equal(soft.weight_g, 290, "/en shows the strung figure");
  // JSON-serialisable: this is the request body.
  assert.equal(typeof JSON.stringify(state), "string");
});

test("pt-BR state is in the unstrung convention the card shows", () => {
  const state = buildState([racket({ weightGrams: 317 })], {}, "pt-BR") as {
    weight_convention: string;
    candidates: { weight_g: number; weight_is_approximate?: boolean }[];
  };
  assert.match(state.weight_convention, /unstrung/);
  assert.equal(state.candidates[0].weight_g, 300);
  assert.equal(state.candidates[0].weight_is_approximate, true);
});

test("combine is a weighted mean, and the prefilter order breaks ties", () => {
  const [a, b, c] = [racket({ id: "a" }), racket({ id: "b" }), racket({ id: "c" })];
  const weights = { power: 1, arm: 2 } as const;
  const answers: JevAnswers = {
    [questionKey("power", "a")]: { noul: 0.9 },
    [questionKey("arm", "a")]: { noul: 0.3 },
    [questionKey("power", "b")]: { noul: 0.5 },
    [questionKey("arm", "b")]: { noul: 0.5 },
    [questionKey("power", "c")]: { noul: 0.5 },
    [questionKey("arm", "c")]: { noul: 0.5 },
  };
  const ranked = combine([a, b, c], answers, weights);
  // a: (0.9 + 2*0.3)/3 = 0.5 — same Jev mean as b and c...
  assert.equal(ranked.find((r) => r.racket.id === "a")?.jev, 0.5);
  // ...so the prefilter prior decides, keeping the incoming order.
  assert.deepEqual(ranked.map((r) => r.racket.id), ["a", "b", "c"]);
  assert.deepEqual(ranked[0].dims, { power: 0.9, arm: 0.3 });
});

test("a clear Jev preference beats the prefilter prior", () => {
  const cands = [racket({ id: "first" }), racket({ id: "last" })];
  const ranked = combine(
    cands,
    {
      [questionKey("power", "first")]: { noul: 0.4 },
      [questionKey("power", "last")]: { noul: 0.8 },
    },
    { power: 1 },
  );
  assert.deepEqual(ranked.map((r) => r.racket.id), ["last", "first"]);
});

test("missing answers do not crash the combination", () => {
  const cands = [racket({ id: "x" }), racket({ id: "y" })];
  const ranked = combine(cands, { [questionKey("power", "x")]: { noul: 0.7 } }, { power: 1 });
  assert.equal(ranked.find((r) => r.racket.id === "y")?.jev, null);
  assert.equal(ranked.length, 2);
});

test("fallback ranking is the prefilter order with no Jev figures", () => {
  const cands = [racket(), racket(), racket()];
  const ranked = fallbackRanking(cands);
  assert.deepEqual(ranked.map((r) => r.racket.id), cands.map((r) => r.id));
  assert.ok(ranked.every((r) => r.jev === null && Object.keys(r.dims).length === 0));
  assert.ok(ranked[0].score > ranked[1].score && ranked[1].score > ranked[2].score);
});
