// Polity colours: OKLab/OKLCH maths, and the CSS variables the map and its
// legends use. Shared by the site (which builds the variables from the
// colours in borders.json) and the build tools.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToOklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
export function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, delin(v))) * 255));
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Dark-mode twin of a light pastel fill: same hue, low lightness. */
export function darkFill(hex) {
  const [, C, H] = hexToOklch(hex);
  return oklchToHex(0.34, Math.min(0.07, C * 1.1 + 0.01), H);
}

/** Muted twin of a fill, for polities that are not part of the war in view. */
export function mutedFill(hex, dark) {
  const [L, C, H] = hexToOklch(hex);
  return dark ? oklchToHex(0.3, Math.min(0.04, C * 0.6), H) : oklchToHex(Math.min(0.95, L + 0.035), C * 0.45, H);
}
/** CSS custom properties for polity i: --p<i> (fill), --q<i> (muted), light and dark. */
export function polityCSS(colors) {
  const light = colors.map((c, i) => `--p${i}:${c};--q${i}:${mutedFill(c, false)};`).join('');
  const dark = colors.map((c, i) => `--p${i}:${darkFill(c)};--q${i}:${mutedFill(c, true)};`).join('');
  return `:root{${light}}\n:root[data-theme="dark"]{${dark}}\n`;
}
