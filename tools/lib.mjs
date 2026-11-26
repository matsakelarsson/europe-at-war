// Shared helpers for the build tools.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { oklchToHex } from '../site/colors.js';
export { hexToOklch, oklchToHex, darkFill } from '../site/colors.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT = join(ROOT, 'content');

export const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
export const readYAML = async (p) => YAML.parse(await readFile(p, 'utf8'));
export async function exists(p) { try { await readFile(p); return true; } catch { return false; } }
export async function listFiles(dir, ext) {
  try { return (await readdir(dir)).filter((f) => f.endsWith(ext)).sort(); } catch { return []; }
}

export function slug(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

/** Curated + auto polities, merged. Curated wins on id and alias clashes. */
export async function loadPolities() {
  // polities.yaml plus any topic files in content/polities/ (all curated).
  const curated = (await readYAML(join(CONTENT, 'polities.yaml'))) || [];
  for (const f of await listFiles(join(CONTENT, 'polities'), '.yaml')) curated.push(...(((await readYAML(join(CONTENT, 'polities', f))) || []).map((p) => ({ ...p, file: f }))));
  let auto = [];
  if (await exists(join(CONTENT, 'polities.auto.yaml'))) auto = (await readYAML(join(CONTENT, 'polities.auto.yaml'))) || [];
  const byId = new Map();
  const alias = new Map();
  for (const p of curated) {
    if (byId.has(p.id)) throw new Error(`${p.file || 'polities.yaml'}: duplicate polity id ${p.id}`);
    byId.set(p.id, { ...p, curated: true });
    for (const a of p.aliases || []) {
      if (alias.has(a) && alias.get(a) !== p.id) throw new Error(`polities.yaml: alias "${a}" used by ${alias.get(a)} and ${p.id}`);
      alias.set(a, p.id);
    }
  }
  // An auto polity whose names have all been claimed by curated polities is
  // superseded: its id redirects to the curated polity (keyframes may still use it).
  const redirect = new Map();
  for (const p of auto) {
    if (byId.has(p.id)) continue;
    const aliases = (p.aliases || []).filter((a) => !alias.has(a));
    if (!aliases.length && p.aliases?.length) { redirect.set(p.id, alias.get(p.aliases[0])); continue; }
    byId.set(p.id, { ...p, auto: true });
    for (const a of aliases) alias.set(a, p.id);
  }
  return { byId, alias, curated, auto, redirect };
}

/** A soft pastel derived from a string, for auto polities. */
export function hashColor(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hue = (h >>> 0) % 360;
  return oklchToHex(0.89, 0.045, hue);
}

export async function writeText(p, s) { await writeFile(p, s); }
