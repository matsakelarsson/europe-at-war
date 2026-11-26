// The authoring projection: spherical Lambert azimuthal equal-area centred on
// 10°E 52°N (the spherical twin of EPSG:3035). Output units are kilometres,
// x to the east and y to the SOUTH. The site itself draws an orthographic
// globe from longitude and latitude (site/globe.js); these kilometres are used
// at build time (step views, arrow curves, the relief raster, atom interior
// points) and by `?box=` links. site/globe.js repeats the centre and radius.
import { geoAzimuthalEqualArea } from 'd3-geo';

export const CENTER = [10, 52];
export const RADIUS = 6371.0088;
const atlasProjection = () => geoAzimuthalEqualArea()
  .rotate([-CENTER[0], -CENTER[1]])
  .scale(RADIUS)
  .translate([0, 0]);
export const projection = atlasProjection().precision(0);

const r1 = (v) => Math.round(v * 10) / 10;

/** [lon, lat] -> [x, y] in km (SVG units), rounded to 100 m. */
export function project(lonlat) {
  const p = projection(lonlat);
  return [r1(p[0]), r1(p[1])];
}
/** Unrounded projection, for geometry. */
export function projectRaw(lonlat) { return projection(lonlat); }
/** [x, y] -> [lon, lat] */
export function unproject(xy) { return projection.invert(xy); }

/** Walk any GeoJSON geometry's coordinates through fn. */
export function mapCoords(geom, fn) {
  if (!geom) return geom;
  const walk = (c) => (typeof c[0] === 'number' ? fn(c) : c.map(walk));
  if (geom.type === 'GeometryCollection') return { ...geom, geometries: geom.geometries.map((g) => mapCoords(g, fn)) };
  return { ...geom, coordinates: walk(geom.coordinates) };
}

// The home view in projected km: Iceland and Portugal to the Urals and
// Caspian, North Africa and the Levant to the North Cape.
export const FRAME = { x0: -1950, y0: -2400, x1: 3650, y1: 2350 };
// The region whose admin-1 regions are atoms (and which the relief raster
// covers). Atoms that reach beyond it are kept whole; the rest of the world is
// plain land.
export const DATA_CLIP = { x0: FRAME.x0 - 1100, y0: FRAME.y0 - 650, x1: FRAME.x1 + 1100, y1: FRAME.y1 + 900 };

/** A km box [x, y, w, h] as a globe view: [lon, lat, w, h], centre and size. */
export function boxView([x, y, w, h]) {
  const [lon, lat] = unproject([x + w / 2, y + h / 2]);
  return [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, Math.round(w), Math.round(h)];
}

/**
 * The same kind of projection centred on another point, for work far from
 * Europe: step views and arrow curves are worked out around the step's own
 * centre, where kilometres are true. Same conventions (km, x east, y south).
 */
export function localProjection(center) {
  const pr = atlasProjection().rotate([-center[0], -center[1]]).precision(0);
  const unproj = (xy) => pr.invert(xy);
  return {
    center,
    project: (lonlat) => { const p = pr(lonlat); return [r1(p[0]), r1(p[1])]; },
    unproject: unproj,
    boxView: ([x, y, w, h]) => {
      const [lon, lat] = unproj([x + w / 2, y + h / 2]);
      return [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, Math.round(w), Math.round(h)];
    },
  };
}

/** The centre of points on the sphere ([lon, lat] in degrees), or null for none. */
export function sphericalCenter(points) {
  let x = 0, y = 0, z = 0;
  const RAD = Math.PI / 180;
  for (const [lon, lat] of points) {
    const c = Math.cos(lat * RAD);
    x += c * Math.cos(lon * RAD); y += c * Math.sin(lon * RAD); z += Math.sin(lat * RAD);
  }
  const n = Math.hypot(x, y, z);
  if (!points.length || n < 1e-9) return null;
  return [Math.atan2(y, x) / RAD, Math.asin(z / n) / RAD];
}
