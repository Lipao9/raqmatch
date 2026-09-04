---
name: RaqMatch
description: Match-analytics instrument that reads a player's game and returns three justified racquets.
colors:
  night-graphite: "oklch(0.16 0.012 250)"
  chalk: "oklch(0.95 0.006 95)"
  panel: "oklch(0.2 0.014 250)"
  citron: "oklch(0.87 0.17 115)"
  citron-ink: "oklch(0.2 0.03 110)"
  secondary-wash: "oklch(0.26 0.016 250)"
  muted-wash: "oklch(0.23 0.014 250)"
  readout-grey: "oklch(0.73 0.015 250)"
  accent-wash: "oklch(0.28 0.022 250)"
  accent-wash-foreground: "oklch(0.9 0.02 250)"
  fault-red: "oklch(0.66 0.19 25)"
  hairline: "oklch(1 0 0 / 14%)"
  input-hairline: "oklch(1 0 0 / 18%)"
  court: "oklch(0.3 0.035 255)"
  court-line: "oklch(1 0 0 / 55%)"
  court-australian-open: "oklch(0.5 0.115 225)"
  court-roland-garros: "oklch(0.5 0.115 45)"
  court-wimbledon: "oklch(0.42 0.1 150)"
  court-us-open: "oklch(0.44 0.115 255)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.25rem)"
    fontWeight: 700
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Archivo, ui-sans-serif, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    fontVariation: "'wdth' 112"
  body:
    fontFamily: "Geist, ui-sans-serif, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    letterSpacing: "0.16em"
rounded:
  none: "0px"
  sm: "0.225rem"
  md: "0.3rem"
  lg: "0.375rem"
  xl: "0.525rem"
spacing:
  gutter: "1.5rem"
  gutter-wide: "2.5rem"
  section: "5rem"
  section-wide: "7rem"
components:
  button-primary:
    backgroundColor: "{colors.citron}"
    textColor: "{colors.citron-ink}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-primary-hover:
    backgroundColor: "{colors.citron}"
  button-outline:
    backgroundColor: "{colors.night-graphite}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.xl}"
  badge-default:
    backgroundColor: "{colors.citron}"
    textColor: "{colors.citron-ink}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
---

# Design System: RaqMatch

## Overview

**Creative North Star: "Leitura de Jogo"** — Hawk-Eye ball-tracking graphics (direction seed 75c9d8a4).

The site is a match-analytics instrument, not a quiz tool with a hero. The ground
is a night-graphite broadcast studio; the court surface of the current Grand Slam
season owns the large fields; the visitor's answers become a tracked trace and the
three recommendations land as bounce points. Everything on screen behaves like a
replay graphic: hairline court geometry, mono uppercase readouts, values measured
against a scale, and one optic-citron ball that is the only thing allowed to act.

This is a committed single dark look. There is deliberately no light mode and no
`.dark` block in `src/app/globals.css` — the seasonal `[data-theme]` blocks retint
the same night, they never lighten it. The world explicitly refuses the centered-hero
quiz-tool landing page: the first viewport is a full-bleed court with the headline
in a chyron panel bottom-left and the CTA sitting at the serve's bounce point.

**Key Characteristics:**
- Night graphite ground; the season's court surface (`--court`) carries the large fields.
- Optic citron is the only action color — the ball is the constant, the surface is the season.
- Hairline court lines and hairline borders; depth is drawn, never cast.
- Numbers never float: every spec sits on a graticule against the catalog's min–max ruler.
- Broadcast typography: wide Archivo display, Geist body, Geist Mono readouts.

## Colors

A dark broadcast palette: cool graphite neutrals, one loud citron, and a court
surface that follows the tennis calendar.

### Primary
- **Optic Citron** (`--primary`, oklch(0.87 0.17 115)): the ball. The single action
  color — CTAs, graticule markers, focus rings (`--ring` is the same value), the
  live-season dot, hero `<em>` emphasis, the rank-1 badge, the impact ring and
  serve trace. Text on citron uses **Citron Ink** (oklch(0.2 0.03 110)).
- **Fault Red** (`--destructive`, oklch(0.66 0.19 25)): errors only; never decorative.

### Secondary
- **Season Surface** (`--court`, house value oklch(0.3 0.035 255)): the full-bleed
  court ground of the hero. Retinted per Grand Slam season by the `[data-theme]`
  blocks: Australian Open cyan-cobalt (oklch(0.5 0.115 225)), Roland-Garros terre
  battue (oklch(0.5 0.115 45)), Wimbledon lawn (oklch(0.42 0.1 150)), US Open
  stadium blue (oklch(0.44 0.115 255)). Between seasons the neutral practice
  court above holds. Season windows live in `src/lib/slam.ts`; an inline head
  script stamps `data-theme` on `<html>` before first paint (`?slam=` overrides
  for preview, `?slam=off` forces the house palette).
- **Court Line** (`--court-line`, oklch(1 0 0 / 55%)): the hairline court geometry
  and graticule ticks drawn on the surface.

### Neutral
- **Night Graphite** (`--background`, oklch(0.16 0.012 250)): the page ground.
  Seasonal themes shift its hue a few degrees toward the surface, never its darkness.
- **Chalk** (`--foreground`, oklch(0.95 0.006 95)): body text; slightly warm, never pure white.
- **Panel** (`--card`, oklch(0.2 0.014 250)): cards, chyron interiors, popovers.
- **Muted Wash** (`--muted`, oklch(0.23 0.014 250)) and **Readout Grey**
  (`--muted-foreground`, oklch(0.73 0.015 250)): supporting copy and quiet fills.
- **Accent Wash** (`--accent`, oklch(0.28 0.022 250)): hover/selected surface tint;
  in season it picks up the season hue (Wimbledon's wash is royal purple).
- **Hairline** (`--border`, oklch(1 0 0 / 14%)) and **Input Hairline** (`--input`,
  oklch(1 0 0 / 18%)): all borders and dividers are translucent white hairlines.

### Named Rules
**The Constant Ball Rule.** The season retints the surface and its washes; the
ball never changes. `--primary`, `--primary-foreground`, and `--ring` are identical
in all four `[data-theme]` blocks. Never introduce a seasonal accent that competes
with citron for action.

**The Flood Gate Rule.** Saturated color floods only the active or selected
element (a chosen quiz answer goes `border-primary bg-accent`; the rank-1 badge
alone is solid citron). Everything at rest is graphite, hairline, and grey.

**The Fringe First Rule.** Season color enters as narrow fringes before fields:
the header badge's citron dot, a season chip's `color-mix` border, the accent
wash — the full `--court` field appears only on the hero court itself.

**The Away Colors Rule.** Brand surfaces that leave the site (favicon, OG images)
stay on the neutral house look year-round; only the live page follows the calendar.

## Typography

**Display Font:** Archivo (variable `wdth` axis; falls back to the sans stack)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono

**Character:** Broadcast-grade. The display voice is a wide grotesque — every
`.font-heading` element carries `font-stretch: 112%` from `globals.css`, so the
chyron width is a global property of the voice, not a per-element flag. Readouts
are small mono uppercase with generous letterspacing, like on-air stat overlays.

### Hierarchy
- **Display** (Archivo 700, `text-4xl` → `sm:text-6xl`, `leading-[1.02]`,
  `tracking-tight`): the chyron headline only. Citron enters it via a
  `not-italic text-primary` `<em>`, never as a full-line color.
- **Headline** (Archivo 700, `text-3xl` → `sm:text-4xl`, `tracking-tight`): section titles.
- **Title** (Archivo 600, `text-lg`–`text-2xl`): card titles, quiz options headers,
  racquet names.
- **Body** (Geist 400, `text-sm`–`text-base`/`text-lg`, `leading-relaxed`): prose;
  supporting copy sits in Readout Grey and is width-capped (`max-w-md`/`max-w-xl`).
- **Label / Readout** (Geist Mono 400, 0.6–0.7rem, uppercase,
  `tracking-[0.12em]`–`[0.2em]`): status lines, spec values, season badges, scale
  endpoints, durations. Any figure the instrument "measured" renders in mono.

### Named Rules
**The Mono Readout Rule.** Data speaks mono: spec values, ranges, timestamps,
season names, and counts are Geist Mono, uppercase where they label, citron where
they are the measured value.

## Layout

Full-width sections separated by hairline borders, not by background bands alone.
Section rhythm is `px-6 py-20 sm:px-10 sm:py-28`; the sticky header is
`px-6 py-4` on `bg-background/75 backdrop-blur-md`. The first viewport is
`min-h-[calc(100svh-3.75rem)]` with the `TrackingCourt` SVG absolutely full-bleed
behind it, a mono status readout pinned top-left, and the chyron panel pinned to
the bottom edge (full-width on phones, `sm:max-w-xl` bottom-left on wider screens).

The stats ticker is a 3-column `dl` divided by hairlines. The "how it works" rally
is a 3-column list whose steps sit as citron bounce dots on one hairline rally
line (`sm:` and up). Content pages (quiz, racquet detail) center a `max-w-3xl`+
column; the racquet detail uses a 2/3-split grid for measured specs. Breakpoints
are Tailwind defaults; `40rem` (sm) reveals the header season badge, `lg` switches
the hero serve variant.

## Elevation & Depth

**Elevation is drawn, never cast: border and ring, no soft shadows.** On the night
ground a blurred shadow reads as smudge, so surfaces separate by hairline borders
(`border-border`), rings (`ring-1 ring-foreground/10` on Card), backdrop blur on
translucent panels (chyron `bg-background/85 backdrop-blur-md`, header
`bg-background/75`), and tonal steps (background → card → accent). Hover lift is
positional (`hover:-translate-y-0.5`) plus a border shift toward
`border-primary/50–60`, not a shadow.

### Named Rules
**The Hairline Elevation Rule.** No `box-shadow` on any surface. Depth =
hairline border + tonal step + blur, and citron ring only for focus
(`focus-visible:ring-3 ring-ring/50`).

## Shapes

Two form languages coexist deliberately. World-native surfaces are **square**:
the chyron panel, season chips, quiz mode cards, header season badge, graticules,
and season swatches all render with no radius — broadcast overlays have corners.
Interactive primitives keep a small radius from `--radius: 0.375rem`
(`rounded-lg` buttons, `rounded-xl` cards and quiz answer rows, `rounded-4xl`
pill badges). Dots are true circles (`rounded-full`): live-season indicator,
rally bounce points, rank medallions.

Court geometry is always hairline stroke: `CourtLines` (decorative, currentColor
at low opacity, e.g. `text-primary/8`) and `TrackingCourt` (the hero's living
ground at real 78×36ft doubles proportions).

## Components

### Buttons
- **Shape:** small radius (`rounded-lg`, 0.375rem); default `h-8`, hero CTAs
  `size="lg"` overridden to `h-12 px-7 text-base font-semibold`.
- **Primary:** solid citron on citron ink (`bg-primary text-primary-foreground`),
  `hover:bg-primary/80`. The primary button is the bounce point — one per view
  whenever possible.
- **Outline:** hairline border, transparent/graphite fill, Readout Grey text
  (the hero's secondary CTA adds `bg-transparent text-muted-foreground`).
- **Focus:** `focus-visible:ring-3 ring-ring/50` citron ring; **Active:** `translate-y-px`.

### Chips / Badges
- **Season badge (header):** square, `border border-border bg-accent/60`, Geist
  Mono `0.65rem` uppercase `tracking-[0.14em]`, citron dot. All four ship in the
  static HTML; CSS (`[data-slam-badge]` rules) reveals only the active season's —
  no client date logic. Hidden below `40rem`.
- **"Now" tag (season strip):** solid citron micro-chip, mono `0.6rem` uppercase,
  revealed the same CSS-only way via `[data-season-now]`.
- **UI Badge primitive:** pill (`rounded-4xl`, h-5, text-xs); default solid
  citron, `outline` hairline variant for spec tags.

### Cards / Containers
- **World cards** (season chips, quiz mode choices): square, `border border-border
  bg-card`, hover `border-primary/60 bg-accent/40`.
- **Card primitive:** `rounded-xl bg-card ring-1 ring-foreground/10`, internal
  spacing `--card-spacing: 1rem`; titles in `.font-heading`. Result cards mark
  rank with a `h-0.5 bg-primary` top strip and a circular rank medallion (solid
  citron for #1 only).
- **Chyron panel:** the signature container — square, `border border-border
  bg-background/85 backdrop-blur-md p-7 sm:p-10`, entering with
  `animate-in fade-in slide-in-from-bottom-4 duration-700`.

### Inputs / Quiz answers
- **Style:** `rounded-xl border p-4`, resting `border-input bg-card/60`.
- **Hover:** `-translate-y-0.5` + `border-primary/50` + accent wash.
- **Selected:** `border-primary bg-accent` (surface wash), or solid
  `bg-primary text-primary-foreground` for compact scale points.
- **Focus:** citron ring, same vocabulary as buttons.

### Navigation
- **Header:** sticky, hairline bottom border, translucent blurred background;
  brand mark left with the season badge beside it; links are `text-sm
  text-muted-foreground hover:text-primary`.
- **Footer:** hairline top border, centered mono-adjacent small text, a
  `bg-primary/30` tick centered above it.

### Graticule (signature component)
`src/components/Graticule.tsx` — the measured track. A 3px-tall track with
hairline end caps, hairline center line, and nine tick divisions; a value is
either a citron **marker** (a measurement placed on the catalog's min–max ruler,
mono min/max endpoints beneath) or a citron **bar** filled from zero (a quantity,
e.g. quiz minutes). Every numeric spec on the landing proof section, racquet
detail pages, and the quiz mode chooser renders on one.

### TrackingCourt (signature component)
`src/components/TrackingCourt.tsx` — the hero's living ground. Season surface
rect (`fill-court`), hairline court geometry (`stroke-court-line`), graticule
frame ticks, a 16s scanner sweep, and one authored 7s tracking moment: the trace
draws (`trace-draw` keyframes on `pathLength={1}`), a SMIL ball rides the same
path, and the impact ring blooms at the landing point. Two serve variants
(`SERVES`) exist because the `slice` crop moves: `lg:` shows a left-baseline
serve landing clear of the chyron; below `lg` a right-to-left serve lands in the
visible strip above the panel. Easing is `cubic-bezier(0.16, 1, 0.3, 1)` for both
trace and ring. Under `prefers-reduced-motion`: trace frozen fully drawn, moving
ball hidden (`.tracking-motion`), ring static at 0.7 opacity (it anchors the CTA).

### Named Rules
**The Shared Coordinates Rule.** Within each serve variant, trace path, ball
`animateMotion` path, and impact ring center are the same coordinates. A trace
that lands where the ring is not is a broken replay.

## Do's and Don'ts

### Do:
- **Do** keep citron (`oklch(0.87 0.17 115)`) the only action color and identical
  across every seasonal theme; text on it is Citron Ink.
- **Do** put every numeric spec on a `Graticule` with mono min/max endpoints —
  no number floats without a scale.
- **Do** separate surfaces with hairline borders (`oklch(1 0 0 / 14%)`), tonal
  steps, and backdrop blur; lift on hover with translate + border shift.
- **Do** render season-dependent chrome (badges, "now" tags) as
  all-variants-in-HTML revealed by `[data-theme]` CSS, so pages stay static and
  the pre-paint head script from `src/lib/slam.ts` remains the only theme logic.
- **Do** honor `prefers-reduced-motion` the built way: freeze the trace drawn,
  hide the moving ball, keep the impact ring static where the CTA anchors.
- **Do** speak data in Geist Mono uppercase with 0.12–0.2em tracking, and display
  in wide Archivo (`.font-heading`, `font-stretch: 112%`).

### Don't:
- **Don't** add soft/blurred box-shadows on the dark ground — elevation is
  border and ring only.
- **Don't** add a light mode or a `.dark` block; the single night look is a
  committed decision, and seasonal themes retint without lightening.
- **Don't** let a seasonal palette touch `--primary`, `--primary-foreground`,
  or `--ring`, or recolor favicon/OG surfaces — assets that leave the site stay
  on the house look year-round.
- **Don't** flood a resting element with saturated color; solid citron marks only
  the active, selected, or #1-ranked element.
- **Don't** center the landing hero — the headline lives in the bottom-left
  chyron panel over the full-bleed court.
- **Don't** freeze the season server-side: pages are statically generated, so the
  visitor's clock (via the inline head script) decides `data-theme`.
