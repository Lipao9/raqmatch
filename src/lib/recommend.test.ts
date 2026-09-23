import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCatalog, type Racket } from "./catalog";
import { fallbackRanking } from "./jev";
import { FALLBACK_MODEL, familyKey, pickDistinct, recommend } from "./recommend";

const byId = new Map(loadCatalog().map((r) => [r.id, r]));
const get = (id: string): Racket => {
  const r = byId.get(id);
  assert.ok(r, `catalog has ${id}`);
  return r;
};

test("versions, years and paint jobs of one frame share a family", () => {
  const same: [string, string][] = [
    ["wilson-blade-98-18x20-v9", "wilson-blade-98-18x20-v10"],
    ["head-speed-mp-2024", "head-speed-mp-2026"],
    ["babolat-pure-aero-2023", "babolat-pure-aero-2026"],
    ["wilson-clash-100-v3", "wilson-clash-100-v3-us-open-racquet-2026"],
    ["tecnifibre-tfight-300", "tecnifibre-tfight-300-ig"],
    ["head-boom-mp-2026", "head-boom-mp-2026-purple"],
  ];
  for (const [a, b] of same) {
    assert.equal(familyKey(get(a)), familyKey(get(b)), `${a} ~ ${b}`);
  }
});

test("different frames in the same line stay distinct", () => {
  const different: [string, string][] = [
    ["wilson-blade-98-16x19-v10", "wilson-blade-98-18x20-v10"],
    ["babolat-pure-aero-2026", "babolat-pure-aero-98-2026"],
    ["wilson-rf-01", "wilson-rf-01-pro"],
    ["yonex-ezone-100-2025", "yonex-ezone-100l-2025"],
    ["head-speed-mp-2026", "head-speed-mp-l-2026"],
    ["babolat-pure-strike-98-16x19-carbon-grey", "babolat-pure-strike-98-18x20-carbon-grey"],
  ];
  for (const [a, b] of different) {
    assert.notEqual(familyKey(get(a)), familyKey(get(b)), `${a} !~ ${b}`);
  }
});

test("the top three never contains two versions of the same frame", () => {
  const ranked = fallbackRanking([
    get("wilson-blade-98-18x20-v10"),
    get("wilson-blade-98-18x20-v9"),
    get("tecnifibre-tfight-305s"),
    get("yonex-percept-97"),
  ]);
  assert.deepEqual(
    pickDistinct(ranked).map((c) => c.racket.id),
    ["wilson-blade-98-18x20-v10", "tecnifibre-tfight-305s", "yonex-percept-97"],
  );
});

test("with fewer families than picks, the slots are filled by rank", () => {
  const ranked = fallbackRanking([
    get("head-speed-mp-2026"),
    get("head-speed-mp-2024"),
    get("head-boom-mp-2026"),
  ]);
  assert.deepEqual(
    pickDistinct(ranked).map((c) => c.racket.id),
    ["head-speed-mp-2026", "head-boom-mp-2026", "head-speed-mp-2024"],
  );
});

test("without a gateway key the recommendation degrades to prefilter order, never to an error", async () => {
  const saved = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const candidates = [
      get("wilson-blade-98-18x20-v10"),
      get("tecnifibre-tfight-305s"),
      get("yonex-percept-97"),
      get("head-speed-pro-2026"),
    ];
    const result = await recommend(
      candidates,
      { skill: "competitive", swing: "racquet-power", style: "serve-volley", struggles: ["flies-long"], armInjury: "past" },
      "pt-BR",
    );
    assert.equal(result.model, FALLBACK_MODEL);
    assert.equal(result.inputTokens, 0);
    assert.deepEqual(
      result.picks.map((p) => p.racketId),
      ["wilson-blade-98-18x20-v10", "tecnifibre-tfight-305s", "yonex-percept-97"],
    );
    for (const pick of result.picks) {
      assert.ok(pick.justification.length > 60, pick.justification);
    }
    assert.ok(result.latencyMs >= 0);
  } finally {
    console.warn = warn;
    if (saved !== undefined) process.env.AI_GATEWAY_API_KEY = saved;
  }
});
