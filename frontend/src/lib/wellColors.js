/**
 * Uniform — now monochrome — colour coding system for oil wells.
 *
 * Distinguishes wells by TONE instead of hue. Every value here is pure grey;
 * there is no chroma anywhere in the palette. The tones are spread evenly from
 * near-white to mid-grey so that adjacent wells stay as separable as
 * monochrome allows.
 *
 * Be aware of the ceiling this imposes: 28 wells across roughly 140 levels of
 * brightness means neighbouring wells differ by only a few percent of tone. On
 * a dense map the label, not the colour, is what actually tells two wells
 * apart. If wells must pop on the map, the honest fix is shape or pattern,
 * not colour.
 *
 * The class strings are written out in full rather than composed from the hex
 * value: Tailwind only generates classes it can see literally in the source, so
 * a template-built `text-[${hex}]` would produce unstyled wells.
 *
 * This file is deliberately NOT routed through the Tailwind palette override in
 * `tailwind.config.js`. That override maps every chromatic family to a single
 * grey ramp, which would collapse all 28 of these to one tone.
 */

export const WELL_COLOR_PALETTES = {
  'OIL-BAGHJAN-1': { text: 'text-[#ffffff]', bg: 'bg-[#ffffff]/10', border: 'border-[#ffffff]/40', badge: 'text-[#ffffff] bg-[#ffffff]/10 border-[#ffffff]/40', hex: '#ffffff' },
  'OIL-BAGHJAN-4': { text: 'text-[#fafafa]', bg: 'bg-[#fafafa]/10', border: 'border-[#fafafa]/40', badge: 'text-[#fafafa] bg-[#fafafa]/10 border-[#fafafa]/40', hex: '#fafafa' },
  'OIL-BAGHJAN-5': { text: 'text-[#f4f4f4]', bg: 'bg-[#f4f4f4]/10', border: 'border-[#f4f4f4]/40', badge: 'text-[#f4f4f4] bg-[#f4f4f4]/10 border-[#f4f4f4]/40', hex: '#f4f4f4' },
  'OIL-MORAN-1': { text: 'text-[#efefef]', bg: 'bg-[#efefef]/10', border: 'border-[#efefef]/40', badge: 'text-[#efefef] bg-[#efefef]/10 border-[#efefef]/40', hex: '#efefef' },
  'OIL-NAHARKATIYA-1': { text: 'text-[#e9e9e9]', bg: 'bg-[#e9e9e9]/10', border: 'border-[#e9e9e9]/40', badge: 'text-[#e9e9e9] bg-[#e9e9e9]/10 border-[#e9e9e9]/40', hex: '#e9e9e9' },
  'OIL-DIKOM-1': { text: 'text-[#e4e4e4]', bg: 'bg-[#e4e4e4]/10', border: 'border-[#e4e4e4]/40', badge: 'text-[#e4e4e4] bg-[#e4e4e4]/10 border-[#e4e4e4]/40', hex: '#e4e4e4' },
  'OIL-TENGAKHAT-1': { text: 'text-[#dedede]', bg: 'bg-[#dedede]/10', border: 'border-[#dedede]/40', badge: 'text-[#dedede] bg-[#dedede]/10 border-[#dedede]/40', hex: '#dedede' },
  'OIL-KOTHALONI-1': { text: 'text-[#d9d9d9]', bg: 'bg-[#d9d9d9]/10', border: 'border-[#d9d9d9]/40', badge: 'text-[#d9d9d9] bg-[#d9d9d9]/10 border-[#d9d9d9]/40', hex: '#d9d9d9' },
  'OIL-HAPJAN-1': { text: 'text-[#d3d3d3]', bg: 'bg-[#d3d3d3]/10', border: 'border-[#d3d3d3]/40', badge: 'text-[#d3d3d3] bg-[#d3d3d3]/10 border-[#d3d3d3]/40', hex: '#d3d3d3' },
  'OIL-SHALMARI-1': { text: 'text-[#cecece]', bg: 'bg-[#cecece]/10', border: 'border-[#cecece]/40', badge: 'text-[#cecece] bg-[#cecece]/10 border-[#cecece]/40', hex: '#cecece' },
  'OIL-KUSIJAN-1': { text: 'text-[#c9c9c9]', bg: 'bg-[#c9c9c9]/10', border: 'border-[#c9c9c9]/40', badge: 'text-[#c9c9c9] bg-[#c9c9c9]/10 border-[#c9c9c9]/40', hex: '#c9c9c9' },
  'OIL-HEBEDA-1': { text: 'text-[#c3c3c3]', bg: 'bg-[#c3c3c3]/10', border: 'border-[#c3c3c3]/40', badge: 'text-[#c3c3c3] bg-[#c3c3c3]/10 border-[#c3c3c3]/40', hex: '#c3c3c3' },
  'OIL-RAJ-BAGHEWALA-1': { text: 'text-[#bebebe]', bg: 'bg-[#bebebe]/10', border: 'border-[#bebebe]/40', badge: 'text-[#bebebe] bg-[#bebebe]/10 border-[#bebebe]/40', hex: '#bebebe' },
  'OIL-RAJ-BAGHEWALA-2': { text: 'text-[#b8b8b8]', bg: 'bg-[#b8b8b8]/10', border: 'border-[#b8b8b8]/40', badge: 'text-[#b8b8b8] bg-[#b8b8b8]/10 border-[#b8b8b8]/40', hex: '#b8b8b8' },
  'OIL-RAJ-TANOT-1': { text: 'text-[#b3b3b3]', bg: 'bg-[#b3b3b3]/10', border: 'border-[#b3b3b3]/40', badge: 'text-[#b3b3b3] bg-[#b3b3b3]/10 border-[#b3b3b3]/40', hex: '#b3b3b3' },
  'OIL-RAJ-TANOT-2': { text: 'text-[#adadad]', bg: 'bg-[#adadad]/10', border: 'border-[#adadad]/40', badge: 'text-[#adadad] bg-[#adadad]/10 border-[#adadad]/40', hex: '#adadad' },
  'OIL-RAJ-DANDEWALA-1': { text: 'text-[#a8a8a8]', bg: 'bg-[#a8a8a8]/10', border: 'border-[#a8a8a8]/40', badge: 'text-[#a8a8a8] bg-[#a8a8a8]/10 border-[#a8a8a8]/40', hex: '#a8a8a8' },
  'OIL-KG-DEEPWATER-1': { text: 'text-[#a2a2a2]', bg: 'bg-[#a2a2a2]/10', border: 'border-[#a2a2a2]/40', badge: 'text-[#a2a2a2] bg-[#a2a2a2]/10 border-[#a2a2a2]/40', hex: '#a2a2a2' },
  'OIL-KG-DWN-98-2': { text: 'text-[#9d9d9d]', bg: 'bg-[#9d9d9d]/10', border: 'border-[#9d9d9d]/40', badge: 'text-[#9d9d9d] bg-[#9d9d9d]/10 border-[#9d9d9d]/40', hex: '#9d9d9d' },
  'OIL-KG-D6-OFFSHORE': { text: 'text-[#989898]', bg: 'bg-[#989898]/10', border: 'border-[#989898]/40', badge: 'text-[#989898] bg-[#989898]/10 border-[#989898]/40', hex: '#989898' },
  'OIL-KG-YANAM-1': { text: 'text-[#929292]', bg: 'bg-[#929292]/10', border: 'border-[#929292]/40', badge: 'text-[#929292] bg-[#929292]/10 border-[#929292]/40', hex: '#929292' },
  'OIL-KG-AMALAPURAM-1': { text: 'text-[#8d8d8d]', bg: 'bg-[#8d8d8d]/10', border: 'border-[#8d8d8d]/40', badge: 'text-[#8d8d8d] bg-[#8d8d8d]/10 border-[#8d8d8d]/40', hex: '#8d8d8d' },
  'OIL-KG-PASARLAPUDI-1': { text: 'text-[#878787]', bg: 'bg-[#878787]/10', border: 'border-[#878787]/40', badge: 'text-[#878787] bg-[#878787]/10 border-[#878787]/40', hex: '#878787' },
  'OIL-MZ-AIZAWL-1': { text: 'text-[#828282]', bg: 'bg-[#828282]/10', border: 'border-[#828282]/40', badge: 'text-[#828282] bg-[#828282]/10 border-[#828282]/40', hex: '#828282' },
  'OIL-MZ-MAMIT-1': { text: 'text-[#7c7c7c]', bg: 'bg-[#7c7c7c]/10', border: 'border-[#7c7c7c]/40', badge: 'text-[#7c7c7c] bg-[#7c7c7c]/10 border-[#7c7c7c]/40', hex: '#7c7c7c' },
  'OIL-MZ-KOLASIB-1': { text: 'text-[#777777]', bg: 'bg-[#777777]/10', border: 'border-[#777777]/40', badge: 'text-[#777777] bg-[#777777]/10 border-[#777777]/40', hex: '#777777' },
  'OIL-MZ-LUNGLEI-1': { text: 'text-[#717171]', bg: 'bg-[#717171]/10', border: 'border-[#717171]/40', badge: 'text-[#717171] bg-[#717171]/10 border-[#717171]/40', hex: '#717171' },
  'OIL-MZ-CHAMPHAI-1': { text: 'text-[#6c6c6c]', bg: 'bg-[#6c6c6c]/10', border: 'border-[#6c6c6c]/40', badge: 'text-[#6c6c6c] bg-[#6c6c6c]/10 border-[#6c6c6c]/40', hex: '#6c6c6c' },
};

/** Fallback for a well with no explicit entry. Tones are spread, not random. */
const DYNAMIC_PALETTE = [
  { text: 'text-[#e8e8e8]', bg: 'bg-[#e8e8e8]/10', border: 'border-[#e8e8e8]/40', badge: 'text-[#e8e8e8] bg-[#e8e8e8]/10 border-[#e8e8e8]/40', hex: '#e8e8e8' },
  { text: 'text-[#dfdfdf]', bg: 'bg-[#dfdfdf]/10', border: 'border-[#dfdfdf]/40', badge: 'text-[#dfdfdf] bg-[#dfdfdf]/10 border-[#dfdfdf]/40', hex: '#dfdfdf' },
  { text: 'text-[#d6d6d6]', bg: 'bg-[#d6d6d6]/10', border: 'border-[#d6d6d6]/40', badge: 'text-[#d6d6d6] bg-[#d6d6d6]/10 border-[#d6d6d6]/40', hex: '#d6d6d6' },
  { text: 'text-[#cdcdcd]', bg: 'bg-[#cdcdcd]/10', border: 'border-[#cdcdcd]/40', badge: 'text-[#cdcdcd] bg-[#cdcdcd]/10 border-[#cdcdcd]/40', hex: '#cdcdcd' },
  { text: 'text-[#c3c3c3]', bg: 'bg-[#c3c3c3]/10', border: 'border-[#c3c3c3]/40', badge: 'text-[#c3c3c3] bg-[#c3c3c3]/10 border-[#c3c3c3]/40', hex: '#c3c3c3' },
  { text: 'text-[#bababa]', bg: 'bg-[#bababa]/10', border: 'border-[#bababa]/40', badge: 'text-[#bababa] bg-[#bababa]/10 border-[#bababa]/40', hex: '#bababa' },
  { text: 'text-[#b1b1b1]', bg: 'bg-[#b1b1b1]/10', border: 'border-[#b1b1b1]/40', badge: 'text-[#b1b1b1] bg-[#b1b1b1]/10 border-[#b1b1b1]/40', hex: '#b1b1b1' },
  { text: 'text-[#a8a8a8]', bg: 'bg-[#a8a8a8]/10', border: 'border-[#a8a8a8]/40', badge: 'text-[#a8a8a8] bg-[#a8a8a8]/10 border-[#a8a8a8]/40', hex: '#a8a8a8' },
  { text: 'text-[#9f9f9f]', bg: 'bg-[#9f9f9f]/10', border: 'border-[#9f9f9f]/40', badge: 'text-[#9f9f9f] bg-[#9f9f9f]/10 border-[#9f9f9f]/40', hex: '#9f9f9f' },
  { text: 'text-[#969696]', bg: 'bg-[#969696]/10', border: 'border-[#969696]/40', badge: 'text-[#969696] bg-[#969696]/10 border-[#969696]/40', hex: '#969696' },
  { text: 'text-[#8c8c8c]', bg: 'bg-[#8c8c8c]/10', border: 'border-[#8c8c8c]/40', badge: 'text-[#8c8c8c] bg-[#8c8c8c]/10 border-[#8c8c8c]/40', hex: '#8c8c8c' },
  { text: 'text-[#838383]', bg: 'bg-[#838383]/10', border: 'border-[#838383]/40', badge: 'text-[#838383] bg-[#838383]/10 border-[#838383]/40', hex: '#838383' },
  { text: 'text-[#7a7a7a]', bg: 'bg-[#7a7a7a]/10', border: 'border-[#7a7a7a]/40', badge: 'text-[#7a7a7a] bg-[#7a7a7a]/10 border-[#7a7a7a]/40', hex: '#7a7a7a' },
];

export function getWellColor(wellId) {
  if (!wellId) return DYNAMIC_PALETTE[0];
  const cleanId = String(wellId).trim().toUpperCase();
  if (WELL_COLOR_PALETTES[cleanId]) {
    return WELL_COLOR_PALETTES[cleanId];
  }
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 31 + cleanId.charCodeAt(i)) % DYNAMIC_PALETTE.length;
  }
  return DYNAMIC_PALETTE[Math.abs(hash)];
}
