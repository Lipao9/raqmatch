export type SlamId =
  | "australian-open"
  | "roland-garros"
  | "wimbledon"
  | "us-open";

export type SlamWindow = {
  slam: SlamId;
  /** First day of the main draw, ISO date. */
  start: string;
  /** Final day of the tournament, ISO date, inclusive. */
  end: string;
};

/**
 * Main-draw dates. They move every year, so each season is listed explicitly
 * and a year nobody added yet simply falls back to the house palette.
 * The 2027 US Open is projected from its traditional slot (last Monday of
 * August, two weeks long) — confirm once the USTA announces it.
 */
export const SLAM_WINDOWS: SlamWindow[] = [
  { slam: "australian-open", start: "2026-01-18", end: "2026-02-01" },
  { slam: "roland-garros", start: "2026-05-24", end: "2026-06-07" },
  { slam: "wimbledon", start: "2026-06-29", end: "2026-07-12" },
  { slam: "us-open", start: "2026-08-31", end: "2026-09-13" },
  { slam: "australian-open", start: "2027-01-16", end: "2027-01-31" },
  { slam: "roland-garros", start: "2027-05-23", end: "2027-06-06" },
  { slam: "wimbledon", start: "2027-06-28", end: "2027-07-11" },
  { slam: "us-open", start: "2027-08-30", end: "2027-09-12" },
];

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slamEnd(slam: SlamId, year: string): string | null {
  const w = SLAM_WINDOWS.find(
    (x) => x.slam === slam && x.start.startsWith(year),
  );
  return w?.end ?? null;
}

/**
 * The theme follows the tennis calendar's seasons, not just the fortnights.
 * Each season ends with its slam's final and starts when attention turns to
 * that swing; between seasons the house palette holds.
 */
/** The year opens already pointed at Melbourne. */
const AO_SEASON_FROM_JAN_1 = true;
/** European clay swing: Houston/Marrakech/Monte-Carlo open it in early April. */
const CLAY_SEASON_START = "-04-01";
/** Grass starts this many days after the clay final ("2–3 days later"). */
const GRASS_GAP_DAYS = 3;
/** The US Open Series starts roughly two weeks after the Wimbledon final. */
const US_SWING_GAP_DAYS = 14;

function seasonStart(w: SlamWindow): string {
  const year = w.start.slice(0, 4);
  switch (w.slam) {
    case "australian-open":
      return AO_SEASON_FROM_JAN_1 ? `${year}-01-01` : w.start;
    case "roland-garros":
      return `${year}${CLAY_SEASON_START}`;
    case "wimbledon": {
      const clayFinal = slamEnd("roland-garros", year);
      return clayFinal ? shiftDays(clayFinal, GRASS_GAP_DAYS) : w.start;
    }
    case "us-open": {
      const grassFinal = slamEnd("wimbledon", year);
      return grassFinal ? shiftDays(grassFinal, US_SWING_GAP_DAYS) : w.start;
    }
  }
}

/** The windows the theme actually uses: full seasons, final-day inclusive. */
export const THEME_WINDOWS = SLAM_WINDOWS.map((w) => ({
  ...w,
  start: seasonStart(w),
}));

/**
 * YYYY-MM-DD in the machine's local timezone. Day precision is all theming
 * needs, and ISO date strings compare correctly as plain strings.
 */
export function localDateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getActiveSlam(date: Date): SlamId | null {
  const stamp = localDateStamp(date);
  const hit = THEME_WINDOWS.find((w) => stamp >= w.start && stamp <= w.end);
  return hit?.slam ?? null;
}

/** Tournament names are proper nouns — identical in every locale. */
export const SLAM_NAMES: Record<SlamId, string> = {
  "australian-open": "Australian Open",
  "roland-garros": "Roland-Garros",
  wimbledon: "Wimbledon",
  "us-open": "US Open",
};

export const SLAM_IDS = Object.keys(SLAM_NAMES) as SlamId[];

/**
 * Inline <head> script that stamps `data-theme` on <html> before first paint.
 * The pages are statically generated, so the server cannot decide the season
 * — rendering it at build time would freeze the theme at the deploy date.
 * The visitor's own clock decides instead, and with no JS the site simply
 * stays Monte-Carlo. See the Next guide on preventing flash before hydration
 * for why this runs as a synchronous script rather than an effect.
 */
export function slamThemeScript(): string {
  const windows = JSON.stringify(
    THEME_WINDOWS.map((w) => [w.slam, w.start, w.end]),
  );
  return `(function(){try{var d=new Date(),p=function(n){return(n<10?"0":"")+n},s=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate()),w=${windows};for(var i=0;i<w.length;i++){if(s>=w[i][1]&&s<=w[i][2]){document.documentElement.setAttribute("data-theme",w[i][0]);break}}}catch(e){}})()`;
}
