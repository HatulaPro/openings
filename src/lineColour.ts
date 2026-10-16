import type { Chapter, Line, Repertoire } from './chess/repertoire';

/**
 * A colour for every line of the repertoire, as a second sense to remember it
 * by: the same line always shows the same colour, and lines you drill one after
 * the other look as different from each other as the palette allows.
 */

/** How many colours there are. Beyond this the repertoire starts reusing them. */
const COUNT = 72;
/** Golden angle: successive hues land as far apart as they can, and spread evenly over the circle. */
const STEP = 137.508;
/** Light, medium and pale bands, so neighbours differ in brightness as well as hue. Tuned for the dark theme. */
const BANDS = [
  { l: 0.78, c: 0.19 },
  { l: 0.66, c: 0.21 },
  { l: 0.85, c: 0.18 },
];

const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** Oklch to linear RGB, which is out of gamut for strong colours; see hex below. */
function linear(l: number, c: number, hue: number): [number, number, number] {
  const a = c * Math.cos((hue * Math.PI) / 180);
  const b = c * Math.sin((hue * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

/** The colour, with as much of the asked-for chroma as the screen can show at that hue. */
function hex(l: number, chroma: number, hue: number): string {
  let rgb = linear(l, chroma, hue);
  for (let c = chroma; c > 0.02 && rgb.some(channel => channel < -0.001 || channel > 1.001); c -= 0.005) {
    rgb = linear(l, c, hue);
  }
  return `#${rgb
    .map(channel => Math.round(Math.min(1, Math.max(0, toSrgb(Math.min(1, Math.max(0, channel))))) * 255)
      .toString(16)
      .padStart(2, '0'))
    .join('')}`;
}

export const PALETTE: string[] = Array.from({ length: COUNT }, (_, i) => {
  const band = BANDS[i % BANDS.length]!;
  return hex(band.l, band.c, (i * STEP) % 360);
});

/**
 * Where a line sits in the repertoire, counting chapters and their lines from
 * the top: this is what the colour is taken from, so it does not depend on what
 * you started drilling.
 */
function rank(rep: Repertoire, chapter: Chapter, line: number): number {
  let seen = 0;
  for (const other of rep.chapters) {
    if (other.index === chapter.index) return seen + line;
    seen += other.lines.length;
  }
  return seen + line;
}

export function colourOfLine(rep: Repertoire, chapter: Chapter, line: Line | number): string {
  return PALETTE[rank(rep, chapter, typeof line === 'number' ? line : line.index) % PALETTE.length]!;
}
