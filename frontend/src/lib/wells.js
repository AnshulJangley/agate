/**
 * Well-selection helpers shared by routes.
 *
 * `getDefaultOffsetWell` mirrors the copy inside App.jsx. It lives here too so
 * the routed pages (which no longer render inside App's scope) can use the same
 * logic; App.jsx is deliberately left untouched during the staged refactor.
 */

export function getDefaultOffsetWell(wellId) {
  const upper = String(wellId || '').toUpperCase();
  if (upper.includes('RAJ') || upper.includes('BAGHEWALA') || upper.includes('TANOT') || upper.includes('DANDEWALA')) {
    return upper.includes('BAGHEWALA') ? 'OIL-RAJ-TANOT-1' : 'OIL-RAJ-BAGHEWALA-1';
  }
  if (upper.includes('KG') || upper.includes('DEEPWATER') || upper.includes('DWN') || upper.includes('YANAM') || upper.includes('AMALAPURAM')) {
    return upper.includes('DEEPWATER') ? 'OIL-KG-DWN-1' : 'OIL-KG-DEEPWATER-1';
  }
  if (upper.includes('MZ') || upper.includes('AIZAWL') || upper.includes('MAMIT') || upper.includes('KOLASIB') || upper.includes('LUNGLEI')) {
    return upper.includes('AIZAWL') ? 'OIL-MZ-MAMIT-1' : 'OIL-MZ-AIZAWL-1';
  }
  return wellId === 'OIL-BAGHJAN-1' ? 'OIL-NAHARKATIYA-1' : 'OIL-BAGHJAN-1';
}
