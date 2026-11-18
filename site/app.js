// Europe at War — browser runtime. Plain ES module, no framework, no build step.
// Data comes from dist/data/*, produced by tools/build.mjs.
const topojson = window.topojson;
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const svg = $('map'), wrap = $('mapwrap'), pop = $('pop');
{ const t = new URLSearchParams(location.search).get('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const KIND_NAMES = { battle: 'Battle', naval: 'Naval battle', siege: 'Siege or capture', held: 'Held out', taken: 'Taken', event: 'Event', treaty: 'Treaty', toll: 'Toll station', air: 'Air attack', capital: 'Capital' };
const AREA_DEFAULTS = { occupied: 'Occupied by {side}', gained: 'Gained in this peace', pledged: 'Held on a pledge', lost: 'Lost in this peace', outline: 'Union', contested: 'Contested', front: 'Front line' };
const HATCH_ROT = [45, -45, 0, 90];

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function dateKey(d) {
  if (d === null || d === undefined) return null;
  const m = String(d).trim().match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  return m ? `${m[1].padStart(4, '0')}-${m[2] || '00'}-${m[3] || '00'}` : null;
}
const yearOf = (k) => (k ? parseInt(k.slice(0, 4), 10) : null);
const fmtYears = (w) => { const a = yearOf(w.sk), b = w.end === 'ongoing' ? 'today' : yearOf(w.ek); return a === b ? String(a) : `${a}–${b}`; };

function shape(kind) {
  switch (kind) {
    case 'battle': return '<circle r="7" class="mfill"/><path d="M-3.1,-3.1L3.1,3.1M3.1,-3.1L-3.1,3.1" class="mglyph"/>';
    case 'naval': return '<circle r="7" class="mfill"/><path d="M-4.3,0.9H4.3L2.6,3.7H-2.6Z M-0.5,0.2V-4.6L3.5,0.2Z" class="mglyph-f"/>';
    case 'siege': return '<rect x="-6.5" y="-6.5" width="13" height="13" rx="2" class="mfill"/><path d="M-3.6,3.6V-1.4H-2.3V-3.3H-0.8V-1.4H0.8V-3.3H2.3V-1.4H3.6V3.6Z" class="mglyph-f"/>';
    case 'held': return '<rect x="-6.3" y="-6.3" width="12.6" height="12.6" rx="2" class="mhollow"/><path d="M-3.4,3.4V-1.3H-2.2V-3.1H-0.8V-1.3H0.8V-3.1H2.2V-1.3H3.4V3.4Z" class="mglyph-s"/>';
    case 'taken': return '<circle r="5" class="mfill"/>';
    case 'event': return '<circle r="6.2" class="mhollow"/><circle r="2.4" class="mfill" style="stroke:none"/>';
    case 'treaty': return '<rect x="-5.6" y="-5.6" width="11.2" height="11.2" transform="rotate(45)" class="mgold"/>';
    case 'toll': return '<circle r="7" class="mgold"/><path d="M-3.6,-1.3q1.8,-1.6 3.6,0t3.6,0M-3.6,1.9q1.8,-1.6 3.6,0t3.6,0" class="mglyph-g"/>';
    case 'air': return '<circle r="7" class="mfill"/><path d="M0,-4.4L1,-0.8L4.4,0.6V1.6L1,0.9L0.7,3L1.8,3.9V4.6L0,4.1L-1.8,4.6V3.9L-0.7,3L-1,0.9L-4.4,1.6V0.6L-1,-0.8Z" class="mglyph-f"/>';
    case 'capital': return '<circle r="3.2" class="mcap"/>';
    default: return '<circle r="5" class="mfill"/>';
  }
}
function labelAttrs(lp) {
  if (lp === 'l') return { x: -11, y: 4, a: 'end' };
  if (lp === 't') return { x: 0, y: -12, a: 'middle' };
  if (lp === 'b') return { x: 0, y: 20, a: 'middle' };
  return { x: 11, y: 4, a: 'start' };
}

// ---------- Geometry helpers ----------
function pathD(g) {
  if (!g) return '';
  const ring = (r, close) => 'M' + r.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
  switch (g.type) {
    case 'Polygon': return g.coordinates.map((r) => ring(r, true)).join('');
    case 'MultiPolygon': return g.coordinates.map((p) => p.map((r) => ring(r, true)).join('')).join('');
    case 'LineString': return ring(g.coordinates, false);
    case 'MultiLineString': return g.coordinates.map((r) => ring(r, false)).join('');
    case 'GeometryCollection': return g.geometries.map(pathD).join('');
    default: return '';
  }
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }

/** Signed distance from (x, y) to the polygon's edges: positive inside. */
function signedDist(poly, x, y) {
  let inside = false, min = Infinity;
  for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    let px = a[0], py = a[1], dx = b[0] - px, dy = b[1] - py;
    if (dx || dy) { const t = ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy); if (t > 1) { px = b[0]; py = b[1]; } else if (t > 0) { px += dx * t; py += dy * t; } }
    dx = x - px; dy = y - py; const d = dx * dx + dy * dy; if (d < min) min = d;
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}
// Pole of inaccessibility (after Mapbox's polylabel, ISC licence).
function polylabel(poly, precision) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const w = x1 - x0, h = y1 - y0, size = Math.min(w, h);
  if (!size) return [x0, y0, 0];
  const dist = (x, y) => signedDist(poly, x, y);
  const cell = (x, y, hh) => { const d = dist(x, y); return { x, y, h: hh, d, max: d + hh * Math.SQRT2 }; };
  const heap = [];
  const push = (c) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].max >= heap[i].max) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const popTop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].max > heap[m].max) m = l; if (r < heap.length && heap[r].max > heap[m].max) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let half = size / 2;
  for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) push(cell(x + half, y + half, half));
  let best = cell(x0 + w / 2, y0 + h / 2, 0);
  let n = 0;
  while (heap.length && n++ < 4000) {
    const c = popTop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    half = c.h / 2;
    push(cell(c.x - half, c.y - half, half)); push(cell(c.x + half, c.y - half, half));
    push(cell(c.x - half, c.y + half, half)); push(cell(c.x + half, c.y + half, half));
  }
  return [best.x, best.y, best.d];
}

// ---------- Load data ----------
const fetchJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); });
let topo, B, WARS, LBL;
try {
  [topo, B, WARS, LBL] = await Promise.all(['data/atoms.topo.json', 'data/borders.json', 'data/wars.json', 'data/labels.json'].map(fetchJSON));
} catch (e) {
  $('loading').textContent = 'The map could not be loaded. ' + e.message;
  throw e;
}
const warById = new Map(WARS.map((w) => [w.id, w]));
const warCache = new Map();
const loadWar = (id) => { if (!warCache.has(id)) warCache.set(id, fetchJSON(`data/wars/${id}.json`)); return warCache.get(id); };
const POL = B.polities;
let curKey = '1648-12-31';
/** A polity's name at a date: `names` holds [until, name] pairs, oldest first. */
function polName(p, key = curKey) {
  for (const [until, n] of p.names || []) if (key < until) return n;
  return p.name;
}
const geoms = topo.objects.atoms.geometries;
geoms.forEach((g, i) => { g.i = i; });
const NA = geoms.length;
const FRAME = B.frame || [-1950, -2400, 5600, 4750];
const REF_W = LBL.refWidth || 2000;

// ---------- Border timeline ----------
const T = B.timeline;
const snaps = new Array(T.length);
function stateIndex(key) {
  let lo = 0, hi = T.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m].k <= key) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function ownersAt(si) {
  if (si < 0) return new Int16Array(NA).fill(-1);
  if (snaps[si]) return snaps[si];
  let k = si; while (k >= 0 && !snaps[k]) k--;
  let cur = k >= 0 ? snaps[k] : new Int16Array(NA).fill(-1);
  for (let i = k + 1; i <= si; i++) {
    const next = cur.slice(); const c = T[i].c;
    for (let j = 0; j < c.length; j += 2) next[c[j]] = c[j + 1];
    snaps[i] = next; cur = next;
  }
  return snaps[si];
}

// ---------- Build the map ----------
const defs = el('defs', null, svg);
const patterns = [];
function hatch(key, rot, cls, width, gap) {
  const id = 'h-' + key;
  if (!defs.querySelector('#' + id)) {
    const p = el('pattern', { id, width: gap, height: gap, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${rot})` }, defs);
    p.innerHTML = cls === 'hatch-lost'
      ? `<rect width="${width}" height="${gap}" class="hatch-lost"/><rect width="${gap}" height="${width}" class="hatch-lost"/>`
      : `<rect width="${width}" height="${gap}" class="${cls}"/>`;
    patterns.push([p, rot]);
    applyPatternScale(p, rot);
  }
  return `url(#${id})`;
}
el('rect', { class: 'sea', x: FRAME[0] - 4000, y: FRAME[1] - 4000, width: FRAME[2] + 8000, height: FRAME[3] + 8000 }, svg);
const gAtoms = el('g', { 'aria-hidden': 'true' }, svg);
const atomEls = new Array(NA), atomFill = new Array(NA).fill('');
for (let i = 0; i < NA; i++) {
  atomEls[i] = el('path', { d: pathD(topojson.feature(topo, geoms[i]).geometry), class: 'atom' }, gAtoms);
}
if (topo.objects.lakes) el('path', { d: pathD(topojson.merge(topo, topo.objects.lakes.geometries)), class: 'lakes', 'aria-hidden': 'true' }, svg);
if (topo.objects.rivers) el('path', { d: topojson.feature(topo, topo.objects.rivers).features.map((f) => pathD(f.geometry)).join(''), class: 'rivers', 'aria-hidden': 'true' }, svg);
const gOv = el('g', { 'aria-hidden': 'true' }, svg);
const blineEl = el('path', { class: 'bline', 'aria-hidden': 'true' }, svg);
el('path', { d: pathD(topojson.mesh(topo, topo.objects.atoms, (a, b) => a === b)), class: 'coast', 'aria-hidden': 'true' }, svg);
const gLbl = el('g', { class: 'lbl', 'aria-hidden': 'true' }, svg);
const gPLbl = el('g', null, gLbl);
const gArrows = el('g', { 'aria-hidden': 'true' }, svg);
const gCaps = el('g', { 'aria-hidden': 'true' }, svg);
const gMarkers = el('g', null, svg);

// Scalables keep a constant on-screen size whatever the zoom.
let fixedScalables = [], stepScalables = [], polScalables = [], heads = [];
const staticLabels = [];
for (const l of LBL.labels) {
  const g = el('g', null, gLbl);
  const t = el('text', { class: l.cls, 'text-anchor': l.anchor, y: 4 }, g);
  t.textContent = l.t;
  fixedScalables.push({ g, x: l.xy[0], y: l.xy[1] });
  staticLabels.push({ g, minZoom: l.minZoom, from: l.from, until: l.until, dateOk: true });
}
for (const c of LBL.capitals) {
  const g = el('g', null, gCaps);
  g.innerHTML = '<circle r="3.2" class="mcap"/>';
  const la = labelAttrs(c.lp);
  const t = el('text', { class: 'caplabel', x: la.x * 0.8, y: la.y, 'text-anchor': la.a }, g);
  t.textContent = c.name;
  fixedScalables.push({ g, x: c.xy[0], y: c.xy[1] });
  staticLabels.push({ g, minZoom: c.minZoom, from: c.from, until: c.until, dateOk: true });
}
$('loading').remove();

// ---------- View handling ----------
let vb = FRAME.slice(), S = 1, anim = null, targetBox = FRAME.slice();
function fit(b) {
  const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, A = cw / ch;
  let [x, y, w, h] = b;
  if (w / h > A) { const nh = w / A; y -= (nh - h) / 2; h = nh; } else { const nw = h * A; x -= (nw - w) / 2; w = nw; }
  return [x, y, w, h];
}
function applyPatternScale(p, rot) { p.setAttribute('patternTransform', `rotate(${rot}) scale(${S.toFixed(4)})`); }
function apply(v) {
  vb = v;
  svg.setAttribute('viewBox', v.map((n) => n.toFixed(2)).join(' '));
  const cw = svg.clientWidth || 1;
  S = v[2] / cw;
  const s = S.toFixed(4);
  for (const list of [fixedScalables, stepScalables, polScalables]) for (const it of list) it.g.setAttribute('transform', `translate(${it.x},${it.y}) scale(${s})`);
  for (const h of heads) {
    const tx = h.x + Math.cos(h.ang) * 6 * S, ty = h.y + Math.sin(h.ang) * 6 * S;
    h.g.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) rotate(${(h.ang * 180 / Math.PI).toFixed(1)}) scale(${s})`);
  }
  svg.style.setProperty('--sw', (3.2 * S).toFixed(3));
  for (const [p, rot] of patterns) applyPatternScale(p, rot);
  const zoom = (REF_W / v[2]) * (cw / 700);
  for (const l of staticLabels) l.g.style.display = zoom >= l.minZoom && l.dateOk ? '' : 'none';
  for (const l of polScalables) l.g.style.display = !l.coll && l.w / S > l.tw && l.h / S > l.th ? '' : 'none';
}
function cullLabels() {
  const taken = [];
  const hit = (r) => taken.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
  for (const l of staticLabels) if (l.g.style.display !== 'none') { const r = l.g.getBoundingClientRect(); if (r.width) taken.push(r); }
  for (const g of gMarkers.children) { const r = g.getBoundingClientRect(); if (r.width) taken.push(r); }
  for (const l of polScalables) {
    if (l.g.style.display === 'none') continue;
    const r = l.g.getBoundingClientRect();
    if (hit(r)) { l.coll = true; l.g.style.display = 'none'; } else taken.push(r);
  }
}
function animateTo(target, dur, done) {
  if (anim) cancelAnimationFrame(anim);
  anim = null;
  if (reduceMotion || !dur) { apply(target); placeLabels(); if (done) done(); return; }
  const from = vb.slice(); let t0 = null;
  const frame = (t) => {
    if (t0 === null) t0 = t;
    const k = Math.min(1, (t - t0) / dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    apply(from.map((a, i) => a + (target[i] - a) * e));
    if (k < 1) anim = requestAnimationFrame(frame); else { anim = null; placeLabels(); if (done) done(); }
  };
  anim = requestAnimationFrame(frame);
}
function clampView(v) {
  let [x, y, w, h] = v;
  const maxW = FRAME[2] * 1.25, minW = 40;
  if (w > maxW) { const k = maxW / w; const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  if (w < minW) { const k = minW / w; const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  const cx = Math.min(Math.max(x + w / 2, FRAME[0]), FRAME[0] + FRAME[2]);
  const cy = Math.min(Math.max(y + h / 2, FRAME[1]), FRAME[1] + FRAME[3]);
  return [cx - w / 2, cy - h / 2, w, h];
}
function clientToMap(cx, cy) {
  const r = svg.getBoundingClientRect();
  return [vb[0] + ((cx - r.left) / r.width) * vb[2], vb[1] + ((cy - r.top) / r.height) * vb[3]];
}
function zoomAt(p, k) {
  const v = [p[0] - (p[0] - vb[0]) * k, p[1] - (p[1] - vb[1]) * k, vb[2] * k, vb[3] * k];
  apply(clampView(v));
  scheduleLabels();
}

// Pan and zoom: wheel, drag, pinch, buttons.
let dragMoved = false;
const pointers = new Map();
let pinch = null;
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (anim) { cancelAnimationFrame(anim); anim = null; }
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  zoomAt(clientToMap(e.clientX, e.clientY), Math.exp(Math.max(-1, Math.min(1, dy * 0.002))));
}, { passive: false });
svg.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  dragMoved = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: vb.slice(), m: clientToMap((a.x + b.x) / 2, (a.y + b.y) / 2) };
  }
});
svg.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (!dragMoved && Math.hypot(p.x - p.x0, p.y - p.y0) < 4) return;
  if (!dragMoved) { dragMoved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); if (anim) { cancelAnimationFrame(anim); anim = null; } closePop(); }
  if (pointers.size === 1) {
    const r = svg.getBoundingClientRect();
    apply(clampView([vb[0] - (dx * vb[2]) / r.width, vb[1] - (dy * vb[3]) / r.height, vb[2], vb[3]]));
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const k = pinch.d / d;
    const v = pinch.vb, m = pinch.m;
    apply(clampView([m[0] - (m[0] - v[0]) * k, m[1] - (m[1] - v[1]) * k, v[2] * k, v[3] * k]));
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { svg.classList.remove('panning'); if (dragMoved) scheduleLabels(); }
};
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(clientToMap(e.clientX, e.clientY), e.shiftKey ? 2 : 0.5); });
$('zin').addEventListener('click', () => zoomAt([vb[0] + vb[2] / 2, vb[1] + vb[3] / 2], 0.6));
$('zout').addEventListener('click', () => zoomAt([vb[0] + vb[2] / 2, vb[1] + vb[3] / 2], 1 / 0.6));
$('zfit').addEventListener('click', () => animateTo(fit(targetBox), 600));

// ---------- Borders, polity labels ----------
let curSi = null, curFocusKey = null, curOwners = null;
const polyCache = new Map();
/** Merged polygons per polity for a border state: [{o, polys: [{rings, bbox, area}], total}] */
function polityPolys(si, own) {
  if (polyCache.has(si)) return polyCache.get(si);
  const groups = new Map();
  for (let i = 0; i < NA; i++) { const o = own[i]; if (o < 0) continue; (groups.get(o) || groups.set(o, []).get(o)).push(geoms[i]); }
  const out = [];
  for (const [o, gs] of groups) {
    const polys = topojson.merge(topo, gs).coordinates.map((rings) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      return { rings, bbox: [x0, y0, x1, y1], area: ringArea(rings[0]) };
    });
    out.push({ o, polys, total: polys.reduce((t, p) => t + p.area, 0) });
  }
  out.sort((a, b) => b.total - a.total);
  if (polyCache.size > 40) polyCache.delete(polyCache.keys().next().value);
  polyCache.set(si, out);
  return out;
}
// Sutherland–Hodgman clip of a ring to a rectangle.
function clipRing(ring, [bx0, by0, bx1, by1]) {
  let pts = ring;
  const edges = [[(p) => p[0] >= bx0, (a, b) => [bx0, a[1] + ((b[1] - a[1]) * (bx0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= bx1, (a, b) => [bx1, a[1] + ((b[1] - a[1]) * (bx1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= by0, (a, b) => [a[0] + ((b[0] - a[0]) * (by0 - a[1])) / (b[1] - a[1]), by0]],
    [(p) => p[1] <= by1, (a, b) => [a[0] + ((b[0] - a[0]) * (by1 - a[1])) / (b[1] - a[1]), by1]]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts;
}
function inRings(rings, x, y) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Polities with visible area in the current view, largest first: [{o, a (km²), rings}] */
function visiblePolities(box) {
  if (curSi === null) return [];
  const out = [];
  for (const P of polityPolys(curSi, curOwners)) {
    let best = null, sum = 0;
    for (const pg of P.polys) {
      const b = pg.bbox;
      if (b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]) continue;
      const inside = b[0] >= box[0] && b[2] <= box[2] && b[1] >= box[1] && b[3] <= box[3];
      const rings = inside ? pg.rings : pg.rings.map((r) => clipRing(r, box)).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      const a = ringArea(rings[0]);
      sum += a;
      if (!best || a > best.a) best = { a, rings, poly: pg };
    }
    if (best) out.push({ o: P.o, a: best.a, sum, rings: best.rings, poly: best.poly });
  }
  out.sort((p, q) => q.sum - p.sum);
  return out;
}
let labelT = 0;
function scheduleLabels() { clearTimeout(labelT); labelT = setTimeout(placeLabels, 140); }
function placeLabels() {
  gPLbl.textContent = '';
  polScalables = [];
  const box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  const px2 = S * S;
  for (const V of visiblePolities(box)) {
    const screenA = V.a / px2;
    if (screenA < 1400) continue;
    const p = POL[V.o];
    let x, y, r;
    const hint = (p.lxy || []).find(([hx, hy]) => hx > box[0] + vb[2] * 0.08 && hx < box[2] - vb[2] * 0.08 && hy > box[1] + vb[3] * 0.08 && hy < box[3] - vb[3] * 0.08 && inRings(V.poly.rings, hx, hy));
    if (hint) { [x, y] = hint; r = Math.max(0, signedDist(V.rings, x, y)); }
    else [x, y, r] = polylabel(V.rings, Math.max(1.5 * S, Math.sqrt(V.a) / 60));
    const tier = screenA > 70000 ? 1 : screenA > 16000 ? 2 : 3;
    const fs = tier === 1 ? 14 : tier === 2 ? 11 : 9.5, ls = tier === 1 ? 3.6 : tier === 2 ? 2.2 : 1.1;
    const name = polName(p);
    let lines = [name];
    if (name.length > 15 && name.includes(' ')) {
      const words = name.split(' '); let best = null;
      for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '); const m = Math.max(a.length, b.length); if (!best || m < best.m) best = { m, l: [a, b] }; }
      lines = best.l;
    }
    const g = el('g', null, gPLbl);
    const t = el('text', { class: `plbl l${tier}`, 'text-anchor': 'middle' }, g);
    lines.forEach((ln, k) => { const ts = el('tspan', { x: 0, y: (k - (lines.length - 1) / 2) * fs * 1.25 + fs * 0.35 }, t); ts.textContent = ln; });
    const chars = Math.max(...lines.map((s) => s.length));
    let bw = 0; { let x0 = Infinity, x1 = -Infinity; for (const [px] of V.rings[0]) { if (px < x0) x0 = px; if (px > x1) x1 = px; } bw = x1 - x0; }
    // Shown when the text roughly fits: its width within the shape's extent
    // and its height within the inscribed circle.
    polScalables.push({ g, x, y, w: Math.min(bw, 4.4 * r), h: 2.6 * r, tw: chars * (fs * 0.62 + ls), th: lines.length * fs * 1.15 });
  }
  apply(vb);
  cullLabels();
}
/** Show the border state at `key`; polity names follow `nameKey` (a step's own date). */
function setBorders(key, focus, nameKey = key) {
  const si = stateIndex(key);
  const own = ownersAt(si);
  const fk = focus ? [...focus].sort((a, b) => a - b).join(',') : '';
  for (const l of staticLabels) l.dateOk = (!l.from || key >= l.from) && (!l.until || key < l.until);
  const keyChanged = nameKey !== curKey;
  curKey = nameKey;
  if (si === curSi && fk === curFocusKey) { if (keyChanged) placeLabels(); else apply(vb); return own; }
  for (let i = 0; i < NA; i++) {
    const o = own[i];
    const v = o < 0 ? 'var(--land)' : focus && !focus.has(o) ? `var(--q${o})` : `var(--p${o})`;
    if (atomFill[i] !== v) { atomEls[i].style.fill = v; atomEls[i].style.stroke = v; atomFill[i] = v; }
  }
  const changed = si !== curSi;
  curSi = si; curFocusKey = fk; curOwners = own;
  if (changed) {
    blineEl.setAttribute('d', pathD(topojson.mesh(topo, topo.objects.atoms, (a, b) => a !== b && own[a.i] !== own[b.i])));
    placeLabels();
  } else apply(vb);
  return own;
}
function swatch(fill, stroke) {
  return `<svg width="18" height="12" aria-hidden="true"><rect x="0.5" y="0.5" width="17" height="11" rx="2" style="fill:${fill};stroke:${stroke || 'var(--line)'}"/></svg>`;
}
function lineSw(ink) {
  return `<svg width="22" height="12" aria-hidden="true" class="side-${ink}"><path d="M1,6H15" style="stroke:var(--mc);stroke-width:3;stroke-linecap:round;fill:none"/><path d="M21,6L14,2.5L15.6,6L14,9.5Z" style="fill:var(--mc)"/></svg>`;
}
function markSw(kind, ink) {
  return `<svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true" class="side-${ink}">${shape(kind)}</svg>`;
}
function boxOf(b) { return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; }
function otherListHTML(box, exclude) {
  const minA = ((box[2] - box[0]) * (box[3] - box[1])) / 2500;
  return visiblePolities(box).filter((V) => V.sum > minA && (!exclude || !exclude.has(V.o))).slice(0, 48)
    .map((V) => `<span>${swatch(`var(--${exclude ? 'q' : 'p'}${V.o})`)}${esc(polName(POL[V.o]))}</span>`).join('');
}

// ---------- Popover ----------
let selected = null, popItems = [];
function closePop() { pop.hidden = true; if (selected) { selected.classList.remove('sel'); selected = null; } }
function openPop(mi) {
  const it = popItems[mi];
  if (!it) return;
  const { m, g } = it;
  if (selected) selected.classList.remove('sel');
  selected = g; g.classList.add('sel');
  pop.innerHTML = '<button type="button" class="x" aria-label="Close">×</button>' +
    `<p class="pk">${esc(KIND_NAMES[m.kind] || '')}</p><h3>${esc(m.name)}</h3><p class="pd">${esc(m.date)}</p><p>${esc(m.text)}</p>`;
  pop.hidden = false;
  pop.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); closePop(); });
  const r = g.querySelector('.hit').getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const cx = r.left + r.width / 2 - wr.left, cy = r.top + r.height / 2 - wr.top;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(Math.max(8, cx - pw / 2), wr.width - pw - 8);
  let top = cy - ph - 18;
  if (top < 8) top = Math.min(cy + 18, wr.height - ph - 8);
  pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
}
pop.addEventListener('click', (e) => e.stopPropagation());
svg.addEventListener('click', () => { if (!dragMoved) closePop(); });

// ---------- Step layers (arrows, markers, areas) ----------
let arrowItems = [];
function clearStepLayers() {
  gArrows.textContent = ''; gMarkers.textContent = ''; gOv.textContent = '';
  stepScalables = []; heads = []; arrowItems = []; popItems = [];
}
function buildStepLayers(war, step) {
  clearStepLayers();
  const inkOf = (sid) => (war.sides.find((s) => s.id === sid) || { ink: 'none' }).ink;
  const sideIdx = (sid) => Math.max(0, war.sides.findIndex((s) => s.id === sid));
  for (const ar of step.areas) {
    if (!ar.atoms.length) continue;
    const d = pathD(topojson.merge(topo, ar.atoms.map((i) => geoms[i])));
    let cls = 'ov', fill = null;
    if (ar.style === 'gained') cls += ' ov-gained';
    else if (ar.style === 'pledged') { cls += ' ov-pledged'; fill = hatch('gold', 45, 'hatch-gold', 2.6, 7); }
    else if (ar.style === 'lost') { cls += ' ov-lost'; fill = hatch('lost', 45, 'hatch-lost', 1.6, 8); }
    else if (ar.style === 'outline') cls += ' ov-outline';
    else { const ink = inkOf(ar.side); const rot = HATCH_ROT[sideIdx(ar.side) % 4]; cls += ` ov-hatch side-${ink}`; fill = hatch(`${ink}-${rot}`, rot, 'hatch', 2.4, 7); }
    const p = el('path', { d, class: cls }, gOv);
    if (fill) p.style.fill = fill;
    if (ar.style !== 'gained' && ar.style !== 'outline' && ar.style !== 'pledged' && ar.style !== 'lost') p.classList.add(`side-${inkOf(ar.side)}`);
  }
  for (const a of step.arrows) {
    const ink = inkOf(a.side);
    const p = el('path', { d: a.d, class: `arrow side-${ink}` }, gArrows);
    const hg = el('g', { class: `side-${ink}` }, gArrows);
    el('path', { d: 'M0,0L-11,-5.5L-8.4,0L-11,5.5Z', class: 'ah' }, hg);
    heads.push({ g: hg, x: a.end[0], y: a.end[1], ang: a.ang });
    if (a.label && a.lxy) {
      const lg = el('g', { class: `side-${ink}` }, gArrows);
      const lt = el('text', { class: 'alabel', 'text-anchor': 'middle', y: 4 }, lg);
      lt.textContent = a.label;
      stepScalables.push({ g: lg, x: a.lxy[0], y: a.lxy[1] });
    }
    arrowItems.push({ path: p, head: hg });
  }
  step.markers.forEach((m, mi) => {
    const ink = inkOf(m.side);
    const g = el('g', { class: `marker side-${ink}`, tabindex: '0', role: 'button', 'aria-label': `${m.name}, ${m.date}` }, gMarkers);
    const la = labelAttrs(m.lp);
    g.innerHTML = '<circle r="16" class="hit"/><circle r="11.5" class="ring"/>' + shape(m.kind) +
      `<text class="mlabel" x="${la.x}" y="${la.y}" text-anchor="${la.a}">${esc(m.name)}</text>`;
    stepScalables.push({ g, x: m.xy[0], y: m.xy[1] });
    g.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openPop(mi); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(mi); } });
    popItems.push({ m, g });
  });
}
function drawArrows(instant) {
  arrowItems.forEach((a, k) => {
    const p = a.path;
    if (instant || reduceMotion) { p.style.transition = 'none'; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; a.head.style.opacity = 1; return; }
    const L = p.getTotalLength();
    p.style.transition = 'none'; p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = L;
    a.head.style.transition = 'none'; a.head.style.opacity = 0;
    p.getBoundingClientRect();
    const delay = k * 180;
    p.style.transition = `stroke-dashoffset 1s cubic-bezier(.4,0,.2,1) ${delay}ms`;
    p.style.strokeDashoffset = 0;
    a.head.style.transition = `opacity .25s ease ${delay + 850}ms`;
    a.head.style.opacity = 1;
  });
}
function hideArrows() {
  for (const a of arrowItems) {
    const p = a.path, L = p.getTotalLength();
    p.style.transition = 'none'; p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = L;
    a.head.style.transition = 'none'; a.head.style.opacity = 0;
  }
}

// ---------- Explore mode ----------
const exploreEl = $('explore'), storyViewEl = $('storyView');
const yearEl = $('year'), yearOut = $('yearOut'), badge = $('yearbadge');
const countryEl = $('country'), qEl = $('q');
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (cc) => { if (cc === 'xk') return 'Kosovo'; try { return regionNames?.of(cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } };
const possessive = (n) => (n.endsWith('s') ? n + '’' : n + '’s');
(function fillCountries() {
  const all = new Set();
  for (const w of WARS) for (const c of w.countries) all.add(c);
  [...all].map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([c, n]) => { const o = document.createElement('option'); o.value = c; o.textContent = n; countryEl.appendChild(o); });
})();
let mode = null, year = 1648;
// A country view: every step of every war that involves the country, in
// reading order (step "when" date, then war start, then step order).
const lensSteps = (cc) => {
  const items = [];
  WARS.forEach((w, wi) => { if (!w.countries.includes(cc)) return; w.steps.forEach((s, i) => { if (!s.c || s.c.includes(cc)) items.push({ w: w.id, s: i, k: s.w || w.sk, wi }); }); });
  items.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.wi - b.wi || a.s - b.s));
  return items;
};
function renderTimelineBars() {
  const cc = countryEl.value;
  const list = WARS.filter((w) => !cc || w.countries.includes(cc));
  const span = 2026 - 800, lanes = [];
  const html = list.map((w) => {
    const a = Math.max(800, yearOf(w.sk)), b = Math.min(2026, w.end === 'ongoing' ? 2026 : yearOf(w.ek));
    let lane = lanes.findIndex((end) => end < a - 3); if (lane < 0) { lane = lanes.length; lanes.push(b); } else lanes[lane] = b;
    if (lane > 3) return '';
    return `<span data-a="${a}" data-b="${b}" style="left:${((a - 800) / span) * 100}%;width:${((b - a + 1) / span) * 100}%;top:${lane * 4.5}px" title="${esc(w.name)}"></span>`;
  }).join('');
  $('tlBars').innerHTML = html;
}
function markTimeline() {
  for (const s of $('tlBars').children) s.classList.toggle('a', +s.dataset.a <= year && +s.dataset.b >= year);
}
function renderWarList() {
  const cc = countryEl.value, q = qEl.value.trim().toLowerCase();
  let list, head;
  if (q) {
    list = WARS.filter((w) => (!cc || w.countries.includes(cc)) && (w.name.toLowerCase().includes(q) || w.steps.some((s) => s.t.toLowerCase().includes(q))));
    head = `Search results (${list.length})`;
  } else {
    const k0 = `${String(year).padStart(4, '0')}-00-00`, k1 = `${String(year).padStart(4, '0')}-99-99`;
    list = WARS.filter((w) => (!cc || w.countries.includes(cc)) && w.sk <= k1 && w.ek >= k0);
    head = `Wars in ${year}${cc ? ` · ${countryName(cc)}` : ''}`;
  }
  $('listHead').textContent = head;
  $('warList').innerHTML = list.length ? list.map((w) => {
    const n = w.steps.length;
    return `<li><a href="#/war/${encodeURIComponent(w.id)}"><span class="wn">${esc(w.name)}</span>${w.tier === 'C' ? '<span class="tier">brief</span>' : ''}<span class="wd">${fmtYears(w)}${n ? ` · ${n} step${n > 1 ? 's' : ''}` : ''}</span>${w.summary ? `<span class="ws">${esc(w.summary)}</span>` : ''}</a></li>`;
  }).join('') : `<li class="empty">${q ? 'No wars match your search.' : 'No wars in the catalogue for this year yet.'}</li>`;
  const lens = $('lensLink');
  if (cc) {
    const n = lensSteps(cc).length;
    lens.hidden = !n;
    lens.href = `#/country/${cc}`;
    lens.innerHTML = `Follow <b>${esc(possessive(countryName(cc)))}</b> wars step by step (${n} steps) ›`;
  } else lens.hidden = true;
}
let yearRaf = 0, hashT = 0;
function setYear(y, opts = {}) {
  year = Math.max(800, Math.min(2026, Math.round(y)));
  yearEl.value = year; yearOut.textContent = year; badge.textContent = year;
  const key = `${String(year).padStart(4, '0')}-12-31`;
  const own = setBorders(key, null);
  const si = stateIndex(key);
  $('bsrc').textContent = si >= 0 ? `Borders: ${T[si].s}` : '';
  renderWarList(); markTimeline();
  $('exOtherList').innerHTML = otherListHTML(boxOf(fit(FRAME)), null);
  $('exOthers').hidden = !$('exOtherList').innerHTML;
  if (!opts.noHash) { clearTimeout(hashT); hashT = setTimeout(() => history.replaceState(null, '', `#/year/${year}`), 250); }
}
yearEl.addEventListener('input', () => { cancelAnimationFrame(yearRaf); yearRaf = requestAnimationFrame(() => setYear(+yearEl.value)); });
const changeYears = [...new Set(T.map((t) => yearOf(t.k)))].sort((a, b) => a - b);
$('yprev').addEventListener('click', () => { const y = [...changeYears].reverse().find((v) => v < year); if (y !== undefined) setYear(y); });
$('ynext').addEventListener('click', () => { const y = changeYears.find((v) => v > year); if (y !== undefined) setYear(y); });
countryEl.addEventListener('change', () => { renderTimelineBars(); renderWarList(); markTimeline(); });
qEl.addEventListener('input', renderWarList);

function explore(y) {
  const entering = mode !== 'explore';
  mode = 'explore'; story = null;
  exploreEl.hidden = false; storyViewEl.hidden = true; badge.hidden = false;
  clearStepLayers(); closePop();
  $('footStory').innerHTML = '';
  document.title = 'Europe at War';
  if (entering) renderTimelineBars();
  setYear(y ?? year, { noHash: true });
  if (entering) { targetBox = FRAME.slice(); animateTo(fit(targetBox), vb[2] === FRAME[2] ? 0 : 800); }
}

// ---------- Story mode (one war, or one country's wars) ----------
const storyEl = $('story'), legendEl = $('legend'), jumpEl = $('jump'), progEl = $('progress');
const prevBtn = $('prev'), nextBtn = $('next');
let story = null, cur = -1, goToken = 0;
function stepBox(step) {
  const b = step.view;
  if (!b) return FRAME.slice();
  const px = b[2] * 0.04, py = b[3] * 0.04;
  return [b[0] - px, b[1] - py, b[2] + 2 * px, b[3] + 2 * py];
}
function buildNav() {
  jumpEl.innerHTML = ''; progEl.innerHTML = '';
  let group = null, lastW = null;
  story.items.forEach((it, k) => {
    const w = warById.get(it.w), s = w.steps[it.s];
    if (it.w !== lastW) { group = document.createElement('optgroup'); group.label = w.name; jumpEl.appendChild(group); }
    const o = document.createElement('option');
    o.value = k; o.textContent = `${k + 1}. ${s.d} · ${s.t}`;
    group.appendChild(o);
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.title = `${k + 1}. ${s.t}`;
    if (lastW !== null && it.w !== lastW) b.className = 'newch';
    b.addEventListener('click', () => go(k));
    progEl.appendChild(b);
    lastW = it.w;
  });
}
jumpEl.addEventListener('change', () => go(+jumpEl.value));
prevBtn.addEventListener('click', () => go(cur - 1));
nextBtn.addEventListener('click', () => go(cur + 1));
function renderNav(i) {
  jumpEl.value = String(i);
  Array.prototype.forEach.call(progEl.children, (b, k) => {
    if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.classList.toggle('done', k < i);
  });
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === story.items.length - 1;
}
function renderLegend(war, step, own) {
  const h = [];
  const vbox = boxOf(fit(stepBox(step)));
  const minA = ((vbox[2] - vbox[0]) * (vbox[3] - vbox[1])) / 2500;
  const present = new Set(visiblePolities(vbox).filter((V) => V.sum > minA).map((V) => V.o));
  const shown = new Set();
  for (const s of war.sides) for (const p of s.polities) if (present.has(p) && !shown.has(p)) { shown.add(p); h.push(`<span>${swatch(`var(--p${p})`)}${esc(polName(POL[p]))}</span>`); }
  const sideOf = (sid) => war.sides.find((s) => s.id === sid);
  for (const ar of step.areas) {
    const s = sideOf(ar.side); const ink = s?.ink || 'none';
    const lab = ar.label || AREA_DEFAULTS[ar.style].replace('{side}', s?.name || '');
    let sw;
    if (ar.style === 'gained') sw = swatch('var(--gold-fill)');
    else if (ar.style === 'pledged') sw = swatch(hatch('gold', 45, 'hatch-gold', 2.6, 7), 'var(--gold)');
    else if (ar.style === 'lost') sw = swatch(hatch('lost', 45, 'hatch-lost', 1.6, 8), 'var(--ink)');
    else if (ar.style === 'outline') sw = '<svg width="18" height="12" aria-hidden="true"><rect x="1" y="1" width="16" height="10" rx="2" style="fill:none;stroke:var(--ink);stroke-width:1.6;stroke-dasharray:4 2"/></svg>';
    else { const rot = HATCH_ROT[Math.max(0, war.sides.indexOf(s)) % 4]; sw = `<span class="side-${ink}" style="display:inline-flex">${swatch(hatch(`${ink}-${rot}`, rot, 'hatch', 2.4, 7), 'var(--mc)')}</span>`; }
    const html = `<span>${sw}${esc(lab)}</span>`;
    if (!h.includes(html)) h.push(html);
  }
  const arrowSides = [...new Set(step.arrows.map((a) => a.side))];
  for (const sid of arrowSides) { const s = sideOf(sid); h.push(`<span>${lineSw(s?.ink || 'none')}${esc(step.moveNames?.[sid] || s?.moves || (s ? `${s.name}: moves` : 'Moves'))}</span>`); }
  const mSides = [...new Set(step.markers.filter((m) => m.kind !== 'toll' && m.kind !== 'treaty').map((m) => m.side))];
  for (const sid of mSides) { const s = sideOf(sid); h.push(`<span>${markSw('taken', s?.ink || 'none')}${esc(step.sideNames?.[sid] || s?.success || (s ? `${s.name}: success` : 'Indecisive or neutral'))}</span>`); }
  legendEl.innerHTML = h.join('');
}
function renderStory(i, war, step) {
  const N = story.items.length;
  let h = `<p class="eyebrow"><b>${esc(war.name)}</b> · Step ${i + 1} of ${N} · ${esc(step.date)}</p>`;
  h += `<h2 class="st">${esc(step.title)}</h2><div class="story">`;
  for (const p of step.body) h += `<p>${esc(p)}</p>`;
  if (step.link) h += `<p class="more"><a href="${esc(step.link.href)}">${esc(step.link.text)}</a></p>`;
  h += '</div>';
  if (step.facts?.length) { h += '<dl class="facts">'; for (const f of step.facts) h += `<dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd>`; h += '</dl>'; }
  if (step.markers.length) {
    h += '<div class="onmap"><h3>On the map</h3><div class="chips">';
    step.markers.forEach((m, mi) => {
      const ink = (war.sides.find((s) => s.id === m.side) || { ink: 'none' }).ink;
      h += `<button type="button" class="chip side-${ink}" data-mi="${mi}">${markSw(m.kind, ink)}${esc(m.name)}</button>`;
    });
    h += '</div></div>';
  }
  if (i === 0) h += '<p class="hint">Tip: you can also use the left and right arrow keys, and drag or scroll to move the map.</p>';
  storyEl.innerHTML = h;
  for (const b of storyEl.querySelectorAll('.chip')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const mi = +b.dataset.mi;
      const r = wrap.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => openPop(mi), reduceMotion ? 0 : 450);
      } else openPop(mi);
    });
  }
}
function renderFooter(war) {
  let h = '';
  if (war.notes?.length) h += war.notes.map((n) => `<p>${esc(n)}</p>`).join('');
  if (war.sources?.length) h += `<h3>Sources for ${esc(war.name)}</h3><ul>${war.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul>`;
  $('footStory').innerHTML = h;
}
async function go(i, instant) {
  if (!story || i < 0 || i >= story.items.length || (i === cur && !instant)) return;
  const token = ++goToken;
  const it = story.items[i];
  const war = await loadWar(it.w);
  if (token !== goToken) return;
  const step = war.steps[it.s];
  closePop();
  cur = i;
  const focus = new Set(war.sides.flatMap((s) => s.polities));
  const own = setBorders(step.borders, focus, step.when || step.borders);
  buildStepLayers(war, step);
  renderStory(i, war, step);
  renderLegend(war, step, own);
  renderNav(i);
  renderFooter(war);
  targetBox = stepBox(step);
  $('otherList').innerHTML = otherListHTML(boxOf(fit(targetBox)), focus);
  $('others').hidden = !$('otherList').innerHTML;
  badge.textContent = step.date;
  document.title = `${step.title} · ${war.name} · Europe at War`;
  history.replaceState(null, '', `#/${story.kind}/${encodeURIComponent(story.id)}/${i + 1}`);
  if (!instant) hideArrows();
  apply(vb);
  animateTo(fit(targetBox), instant ? 0 : 950, () => drawArrows(instant));
}
function openStory(kind, id, i) {
  let items;
  if (kind === 'war') { const w = warById.get(id); if (!w) return explore(); items = w.steps.map((_, k) => ({ w: id, s: k })); }
  else items = lensSteps(id);
  if (!items.length) return explore();
  const same = story && story.kind === kind && story.id === id;
  mode = 'story';
  exploreEl.hidden = true; storyViewEl.hidden = false; badge.hidden = false;
  if (!same) {
    story = { kind, id, items };
    cur = -1;
    buildNav();
    const back = $('back');
    const w0 = warById.get(items[0].w);
    back.href = `#/year/${yearOf(w0.sk)}`;
    back.textContent = kind === 'country' ? `‹ All wars · ${possessive(countryName(id))} wars` : '‹ All wars';
  }
  if (window.matchMedia('(min-width: 900px)').matches) $('others').open = true;
  go(Math.max(0, Math.min(items.length - 1, i || 0)), !same && cur < 0 && !document.body.dataset.started);
  document.body.dataset.started = '1';
}

// ---------- Keyboard, resize, routing ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePop(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (mode === 'story') {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
  } else if (mode === 'explore') {
    if (e.key === 'ArrowRight') { e.preventDefault(); setYear(year + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setYear(year - 1); }
  }
});
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (anim) return; apply(fit(targetBox)); placeLabels(); closePop(); }, 80);
});
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  if ((h[0] === 'war' || h[0] === 'country') && h[1]) openStory(h[0], h[1], (parseInt(h[2], 10) || 1) - 1);
  else explore(h[0] === 'year' && h[1] ? parseInt(h[1], 10) : undefined);
}
window.addEventListener('hashchange', route);
apply(fit(FRAME));
route();
