import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getActiveSlam,
  slamThemeScript,
  SLAM_WINDOWS,
  THEME_WINDOWS,
} from "./slam";

test("the year opens already in Australian Open season", () => {
  assert.equal(getActiveSlam(new Date(2026, 0, 1)), "australian-open");
  assert.equal(getActiveSlam(new Date(2026, 0, 25)), "australian-open");
  // The season ends with the final, not the calendar month.
  assert.equal(getActiveSlam(new Date(2026, 1, 1)), "australian-open");
  assert.equal(getActiveSlam(new Date(2026, 1, 2)), null);
});

test("the clay swing is Roland-Garros season from early April", () => {
  assert.equal(getActiveSlam(new Date(2026, 2, 31)), null);
  assert.equal(getActiveSlam(new Date(2026, 3, 1)), "roland-garros");
  // Monte-Carlo Masters week now reads as clay season, by design.
  assert.equal(getActiveSlam(new Date(2026, 3, 15)), "roland-garros");
  assert.equal(getActiveSlam(new Date(2026, 5, 7)), "roland-garros");
});

test("grass season starts days after the clay final", () => {
  // RG 2026 ends Jun 7; the 2-day breather stays neutral, then grass.
  assert.equal(getActiveSlam(new Date(2026, 5, 8)), null);
  assert.equal(getActiveSlam(new Date(2026, 5, 9)), null);
  assert.equal(getActiveSlam(new Date(2026, 5, 10)), "wimbledon");
  assert.equal(getActiveSlam(new Date(2026, 6, 12)), "wimbledon");
  assert.equal(getActiveSlam(new Date(2026, 6, 13)), null);
});

test("the US swing leads into the US Open", () => {
  // Wimbledon 2026 ends Jul 12; the US Open Series picks up two weeks later.
  assert.equal(getActiveSlam(new Date(2026, 6, 25)), null);
  assert.equal(getActiveSlam(new Date(2026, 6, 26)), "us-open");
  assert.equal(getActiveSlam(new Date(2026, 8, 13)), "us-open");
  assert.equal(getActiveSlam(new Date(2026, 8, 14)), null);
});

test("indoor autumn is off-season for the theme", () => {
  assert.equal(getActiveSlam(new Date(2026, 9, 10)), null);
  assert.equal(getActiveSlam(new Date(2026, 11, 31)), null);
});

test("seasons never overlap", () => {
  const sorted = [...THEME_WINDOWS].sort((a, b) =>
    a.start < b.start ? -1 : 1,
  );
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      sorted[i - 1].end < sorted[i].start,
      `${sorted[i - 1].slam} overlaps ${sorted[i].slam}`,
    );
  }
});

test("every listed year covers all four seasons", () => {
  const years = new Set(SLAM_WINDOWS.map((w) => w.start.slice(0, 4)));
  for (const year of years) {
    const slams = SLAM_WINDOWS.filter((w) => w.start.startsWith(year));
    assert.equal(slams.length, 4, `year ${year} is missing slams`);
  }
});

test("inline script embeds every window and stays inert markup", () => {
  const script = slamThemeScript();
  for (const w of SLAM_WINDOWS) {
    assert.ok(script.includes(`"${w.slam}"`), w.slam);
  }
  // Injected via dangerouslySetInnerHTML: must never close its own tag.
  assert.ok(!script.includes("</"));
});
