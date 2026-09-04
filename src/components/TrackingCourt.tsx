/**
 * The hero's living ground: a full-bleed court on the season's surface with
 * one authored tracking moment — the serve trace draws, the ball rides it,
 * the impact ring blooms exactly where the trace lands. SMIL moves the ball
 * so the loop costs no JS; globals.css (.trace-path/.impact-ring) draws the
 * trace and the ring on the same 7s cycle, and prefers-reduced-motion
 * freezes the trace, hides the moving ball, and keeps the ring static.
 *
 * Real doubles-court proportions (78ft x 36ft), drawn top-down inside a
 * 1200x640 viewBox that `slice` crops per viewport. Because the crop moves,
 * one serve cannot land visibly everywhere: the phone shows roughly the
 * center strip above the chyron (x 440-760, y 0-180), while wide screens
 * show the full width with the chyron owning the bottom-left. So the serve
 * ships in two variants — trace, ball and ring share coordinates inside each,
 * and a breakpoint picks the one whose landing point the chyron cannot
 * occlude. lg is the switch: below it the chyron spans most of the width.
 */
const SERVES = [
  {
    // Wide screens: serve from the left baseline into the right service box,
    // landing well right of the chyron's edge.
    trace: "M 230 180 Q 520 30 740 330",
    cx: 740,
    cy: 330,
    r: 30,
    className: "hidden lg:block",
  },
  {
    // Narrow screens: the visible window is the strip above the chyron —
    // a serve crossing it right-to-left, landing before the panel starts.
    trace: "M 745 40 Q 640 5 515 150",
    cx: 515,
    cy: 150,
    r: 24,
    className: "lg:hidden",
  },
];

export function TrackingCourt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 640"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <defs>
        <linearGradient id="court-scan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.05" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Season surface */}
      <rect width="1200" height="640" className="fill-court" />

      {/* Slow scanner sweep — the ground breathes (raise: shader portal). */}
      <rect
        y="0"
        width="140"
        height="640"
        fill="url(#court-scan)"
        className="tracking-motion"
      >
        <animate
          attributeName="x"
          values="-140;1200"
          dur="16s"
          repeatCount="indefinite"
        />
      </rect>

      {/* Graticule ticks along the frame (raise: oscilloscope). */}
      <g className="stroke-court-line" strokeWidth="1" opacity="0.35">
        {Array.from({ length: 23 }, (_, i) => 100 + i * 50).map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={10} />
        ))}
        {Array.from({ length: 23 }, (_, i) => 100 + i * 50).map((x) => (
          <line key={x} x1={x} y1={630} x2={x} y2={640} />
        ))}
      </g>

      {/* Court geometry, hairlines */}
      <g
        className="stroke-court-line"
        strokeWidth="1.5"
        fill="none"
        vectorEffect="non-scaling-stroke"
      >
        {/* doubles court */}
        <rect x="200" y="136" width="800" height="369" />
        {/* singles sidelines */}
        <line x1="200" y1="182" x2="1000" y2="182" />
        <line x1="200" y1="459" x2="1000" y2="459" />
        {/* service lines */}
        <line x1="385" y1="182" x2="385" y2="459" />
        <line x1="815" y1="182" x2="815" y2="459" />
        {/* center service line */}
        <line x1="385" y1="320.5" x2="815" y2="320.5" />
        {/* center marks */}
        <line x1="200" y1="320.5" x2="212" y2="320.5" />
        <line x1="988" y1="320.5" x2="1000" y2="320.5" />
      </g>

      {/* Net */}
      <g className="stroke-court-line">
        <line x1="600" y1="112" x2="600" y2="529" strokeWidth="3" />
        <circle cx="600" cy="112" r="3.5" className="fill-court-line" stroke="none" />
        <circle cx="600" cy="529" r="3.5" className="fill-court-line" stroke="none" />
      </g>

      {/* The tracked serve — trace, ball and impact ring share coordinates. */}
      {SERVES.map((serve) => (
        <g key={serve.trace} className={serve.className}>
          <path
            d={serve.trace}
            pathLength={1}
            className="trace-path stroke-primary"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <circle
            cx={serve.cx}
            cy={serve.cy}
            r={serve.r}
            className="impact-ring stroke-primary"
            strokeWidth="2"
            fill="none"
          />
          <g className="tracking-motion">
            <circle r="7" className="fill-primary">
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                keyPoints="0;1;1"
                keyTimes="0;0.4;1"
                calcMode="linear"
                path={serve.trace}
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.04;0.42;0.52;1"
                dur="7s"
                repeatCount="indefinite"
              />
            </circle>
          </g>
        </g>
      ))}
    </svg>
  );
}
