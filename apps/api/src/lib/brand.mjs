// QuinApp identity (Manual d'Identitat v1.0). Single source for the Q-nota
// symbol geometry: web SVGs and app icons are generated from here by
// scripts/brand-assets.mjs, and the PDF cards draw these paths directly.

export const BRAND_COLORS = {
  accent: '#ffe234', // groc QuinApp: identitat / destacats
  brand: '#ff4b4b',  // vermell acció: CTA / etiqueta
  ink: '#0d0d0d',
  bg: '#faf9f6',     // crema
  muted: '#6b6b6b',
  live: '#00c896',
};

// 64x64 grid. Q frame + 45° tail, 4u contour, 4u offset shadow, double quaver.
export const SYMBOL_VIEWBOX = 64;
export const SYMBOL_PATHS = {
  shadow: 'M9.68 7.7L53.67 7.7L53.67 46.4L58.33 51.05L49.08 60.3L40.47 51.7L9.68 51.7Z',
  outline: 'M5.68 3.7L49.67 3.7L49.67 42.4L54.33 47.05L45.08 56.3L36.47 47.7L5.68 47.7Z',
  face: 'M9.68 7.7L45.67 7.7L45.67 44.06L48.67 47.05L45.08 50.64L38.13 43.7L9.68 43.7Z',
  note: 'M21.07 15.6L39.67 12.9L39.67 30.1L36.47 30.1L36.47 16.97L24.28 18.74L24.28 32.3L21.07 32.3Z'
    + 'M14.27 35.28A4.9 3.6 -20 1 1 23.48 31.92A4.9 3.6 -20 1 1 14.27 35.28Z'
    + 'M28.77 32.68A4.9 3.6 -20 1 1 37.98 29.32A4.9 3.6 -20 1 1 28.77 32.68Z',
};

// The four approved versions (manual §04). Each layer is [pathKey, color].
export const SYMBOL_VARIANTS = {
  principal: [['shadow', BRAND_COLORS.ink], ['outline', BRAND_COLORS.ink], ['face', BRAND_COLORS.accent], ['note', BRAND_COLORS.ink]],
  // Sobre groc / monocrom: solid black Q, no note, no shadow.
  mono: [['outline', BRAND_COLORS.ink]],
  // Negatiu (dark backgrounds): yellow Q, black note.
  negatiu: [['outline', BRAND_COLORS.accent], ['note', BRAND_COLORS.ink]],
};

export function symbolSvg(variant = 'principal') {
  const layers = SYMBOL_VARIANTS[variant]
    .map(([key, color]) => `  <path fill="${color}" d="${SYMBOL_PATHS[key]}"/>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}">\n${layers}\n</svg>\n`;
}

// Square app tile (yellow, symbol centered at `ratio` of the side), for app
// icons and apple-touch-icon.
export function appTileSvg(size = 1024, ratio = 0.7) {
  const scale = (size * ratio) / SYMBOL_VIEWBOX;
  const offset = (size - size * ratio) / 2;
  const layers = SYMBOL_VARIANTS.principal
    .map(([key, color]) => `    <path fill="${color}" d="${SYMBOL_PATHS[key]}"/>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BRAND_COLORS.accent}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
${layers}
  </g>
</svg>
`;
}
