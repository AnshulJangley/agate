/**
 * Shared monochrome palette for chart traces.
 *
 * Plotly falls back to its own default colorway — blue, orange, green, red —
 * for any trace that does not set `marker.color` / `line.color` explicitly.
 * That fallback is invisible in the source, so it is exactly the kind of chroma
 * a sweep for hardcoded values will miss and a demo will show. Declaring the
 * colorway on each layout closes it off.
 *
 * Tones run bright to dim so that overlapping series stay rank-readable once
 * hue is no longer available to separate them.
 */
export const MONO_COLORWAY = [
  '#FFFFFF',
  '#D4D4D4',
  '#B4B4B4',
  '#9A9A9A',
  '#848484',
  '#6E6E6E',
  '#5A5A5A',
  '#4A4A4A',
];
