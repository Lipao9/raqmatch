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
 * and a year nobody added yet simply falls back to the Monte-Carlo default.
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

/**
 * Qualifying starts roughly a week before the main draw, and that is when
 * attention on the tournament starts climbing — the theme goes up with it.
 */
export const QUALIFYING_LEAD_DAYS = 6;

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The windows the theme actually uses: main draw plus the qualifying lead. */
export const THEME_WINDOWS = SLAM_WINDOWS.map((w) => ({
  ...w,
  start: shiftDays(w.start, -QUALIFYING_LEAD_DAYS),
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
