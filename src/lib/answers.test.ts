import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeAnswers, encodeAnswers, type Answers } from "./answers";
import { QUESTIONS } from "./questions";

function decodeString(encoded: string) {
  const params = Object.fromEntries(new URLSearchParams(encoded));
  return decodeAnswers(params);
}

test("no option value contains a comma (multi answers travel comma-joined)", () => {
  for (const q of QUESTIONS) {
    for (const option of q.options) {
      assert.ok(!option.includes(","), `${q.id}: "${option}"`);
    }
  }
});

const QUICK_ANSWERS: Answers = {
  skill: "intermediate",
  swing: "mixed",
  style: "baseline",
  powerControl: 4,
  struggles: ["low-power", "arm-fatigue"],
  armInjury: "occasional",
  currentRacquet: "Pure Drive 2021",
};

test("quick answers roundtrip through the URL", () => {
  const decoded = decodeString(encodeAnswers(QUICK_ANSWERS, "quick"));
  assert.ok(decoded);
  assert.equal(decoded.mode, "quick");
  assert.deepEqual(decoded.answers, QUICK_ANSWERS);
});

test("detailed answers roundtrip with the spec gate open", () => {
  const answers: Answers = {
    skill: "advanced",
    frequency: "several-times",
    swing: "self-power",
    style: "all-court",
    spinStyle: "heavy-topspin",
    powerControl: 2,
    aggression: 5,
    fitness: 4,
    struggles: ["flies-long"],
    armInjury: "none",
    courtType: ["clay", "hard"],
    specKnowledge: "yes",
    headSizePref: "midplus",
    stringPattern: "open",
    weightSpec: "300-315",
    gripSize: "3",
    currentRacquet: "Blade 98",
    racquetFeel: "adoro o controle, falta um pouco de potência no saque",
    strengths: "forehand agressivo",
    improveGoals: "profundidade no backhand",
  };
  const decoded = decodeString(encodeAnswers(answers, "detailed"));
  assert.ok(decoded);
  assert.deepEqual(decoded.answers, answers);
});

test("encoding drops answers hidden behind a closed gate", () => {
  const encoded = encodeAnswers(
    {
      ...QUICK_ANSWERS,
      frequency: "weekly",
      spinStyle: "flat",
      aggression: 3,
      fitness: 3,
      courtType: ["clay"],
      specKnowledge: "no",
      headSizePref: "midsize", // answered before flipping the gate to "no"
      weightSpec: "under-285",
      strengths: "s",
      improveGoals: "g",
    },
    "detailed",
  );
  const params = new URLSearchParams(encoded);
  assert.equal(params.get("headSizePref"), null);
  assert.equal(params.get("weightSpec"), null);
  assert.equal(params.get("specKnowledge"), "no");
});

test("encoding drops racquetFeel when currentRacquet is empty", () => {
  const encoded = encodeAnswers(
    { ...QUICK_ANSWERS, currentRacquet: "  ", racquetFeel: "vibra demais" },
    "detailed",
  );
  assert.equal(new URLSearchParams(encoded).get("racquetFeel"), null);
});

test("decode rejects bad payloads", () => {
  const cases: [string, Partial<Record<string, string>>][] = [
    ["scale out of range", { powerControl: "9" }],
    ["scale not an integer", { powerControl: "3.5" }],
    ["unknown multi option", { struggles: "low-power,banana" }],
    ["too many selections", { struggles: "low-power,flies-long,off-center,low-spin" }],
    ["exclusive option combined", { struggles: "nothing,low-power" }],
    ["missing required question", { skill: "" }],
  ];
  const base = Object.fromEntries(
    new URLSearchParams(encodeAnswers(QUICK_ANSWERS, "quick")),
  );
  for (const [name, patch] of cases) {
    const params: Record<string, string> = { ...base };
    for (const [k, v] of Object.entries(patch)) {
      if (v === "") delete params[k];
      else params[k] = v!;
    }
    assert.equal(decodeAnswers(params), null, name);
  }
});
