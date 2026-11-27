import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT, exists, listFiles, readYAML } from './lib.mjs';
import { defaultLocale, locales, matchLocale } from '../site/locales/index.js';
import { localizeCatalogue, localizeMap, localizeWar, translateText } from '../site/localized-content.js';

const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g))].sort().join(' ');
const isDirectory = (path) => stat(path).then(info => info.isDirectory()).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return false;
});
const isMapping = (value) => value && typeof value === 'object' && !Array.isArray(value);

function validateMessages(err) {
  const base = locales[defaultLocale].messages;
  for (const [code, { messages, dir }] of Object.entries(locales)) {
    if (matchLocale(code) !== code || !['ltr', 'rtl'].includes(dir)) err(`Invalid locale metadata for ${code}`);
    const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
    for (const key of Object.keys(messages)) if (!Object.hasOwn(base, key)) err(`Locale ${code}: unknown message ${key}`);
    for (const [key, reference] of Object.entries(base)) {
      const value = messages[key];
      const validText = (text, original) => typeof text === 'string' &&
        (key === 'contentFallback' || text.trim()) && placeholders(original) === placeholders(text);
      if (typeof reference === 'string') {
        if (!validText(value, reference)) err(`Locale ${code}: invalid message ${key}`);
      } else if (!isMapping(value) || categories.some(form => !validText(value[form], reference[form] ?? reference.other)) ||
                 Object.entries(value).some(([form, text]) => !categories.includes(form) || !validText(text, reference[form] ?? reference.other))) {
        err(`Locale ${code}: invalid plural forms for ${key}`);
      }
    }
  }
}

function dictionary(value, source, where, err) {
  if (!isMapping(value)) {
    err(`${where}: expected a mapping from source text to translation`);
    return {};
  }
  const entries = [];
  for (const [key, text] of Object.entries(value)) {
    if (!source?.has(key)) err(`${where}: unknown source text ${JSON.stringify(key)}`);
    else if (typeof text !== 'string' || !text.trim()) err(`${where}: missing translation for ${JSON.stringify(key)}`);
    else entries.push([key, text]);
  }
  return Object.fromEntries(entries);
}

export async function loadLocales(err) {
  validateMessages(err);
  const root = join(CONTENT, 'locales');
  if (await isDirectory(root)) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && (!Object.hasOwn(locales, entry.name) || entry.name === defaultLocale)) {
        err(`Unknown translation directory ${entry.name}`);
      }
    }
  }
  return Promise.all(Object.keys(locales).filter(code => code !== defaultLocale).map(async code => {
    const folder = join(root, code);
    const mapFile = join(folder, 'map.yaml');
    const map = await exists(mapFile) ? await readYAML(mapFile) : {};
    const warsFolder = join(folder, 'wars');
    const wars = new Map();
    if (await isDirectory(warsFolder)) for (const name of await listFiles(warsFolder, '.yaml')) {
      wars.set(name.slice(0, -5), await readYAML(join(warsFolder, name)));
    }
    // details: war id -> its translated catalogue details; notes: English
    // border note -> translation (both filled in during the build).
    return { code, map, wars, names: {}, details: new Map(), notes: new Map(), stories: [] };
  }));
}

/**
 * A war's translation file, plus its catalogue details: the name goes into the
 * language's index (loaded at once), and the translated details (summary,
 * step titles and dates, sources) into `details`, for the language's copy of
 * the catalogue bucket the war is in.
 */
export async function compileWarTranslations(locales, war, entry, emit, err) {
  const targets = locales.filter(({ wars }) => wars.has(war.id));
  if (!targets.length) return;
  const strings = new Set();
  const collect = value => { if (value !== '') strings.add(String(value)); return value; };
  localizeWar(war, collect);
  for (const locale of targets) {
    const { code, wars, stories } = locale;
    const text = dictionary(wars.get(war.id), strings, `Locale ${code}, war ${war.id}`, err);
    wars.delete(war.id);
    if (Object.hasOwn(text, entry.name)) locale.names[war.id] = text[entry.name];
    const { name, ...details } = localizeCatalogue({ name: entry.name, ...structuredClone(entry.detail) }, value => translateText(text, value));
    locale.details.set(war.id, details);
    stories.push(war.id);
    await emit(`data/locales/${code}/wars/${war.id}.json`, JSON.stringify(text));
  }
}

/**
 * Each language's map strings, checked against what the map shows. `borders`
 * has the polities and the full timeline (with notes). Border notes go to
 * `notes`, the rest to the language's index.
 */
export function compileLocaleMaps(locales, borders, labels, err) {
  const strings = {};
  localizeMap(borders, labels, (category, value) => {
    (strings[category] ??= new Set()).add(value);
    return value;
  });
  for (const locale of locales) {
    const { code, map, wars } = locale;
    for (const id of wars.keys()) err(`Locale ${code}: unknown war ${id}`);
    locale.translatedMap = {};
    if (!isMapping(map)) { err(`Locale ${code}: expected a mapping in map.yaml`); continue; }
    for (const [category, value] of Object.entries(map)) {
      if (!Object.hasOwn(strings, category)) err(`Locale ${code}: unknown map category ${category}`);
      else locale.translatedMap[category] = dictionary(value, strings[category], `Locale ${code}, map ${category}`, err);
    }
    locale.notes = new Map(Object.entries(locale.translatedMap.borderSources || {}));
    delete locale.translatedMap.borderSources;
  }
}

/**
 * Each language's index (map strings, war names, translated stories) and its
 * copies of the bucket files: the border changes with translated notes, and
 * the catalogue details, translated where there is a translation.
 */
export async function emitLocales(locales, borderChunks, catalogueFiles, emit) {
  const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  for (const { code, translatedMap, names, details, notes, stories } of locales) {
    await emit(`data/locales/${code}/index.json`, JSON.stringify({ map: translatedMap, names: sorted(names), stories: stories.sort() }));
    for (const [bucket, chunk] of borderChunks) {
      const entries = chunk.entries.map((entry) => (notes.has(entry.s) ? { ...entry, s: notes.get(entry.s) } : entry));
      await emit(`data/locales/${code}/borders/${bucket}.json`, JSON.stringify({ ...chunk, entries }));
    }
    for (const [bucket, entries] of catalogueFiles) {
      await emit(`data/locales/${code}/catalogue/${bucket}.json`, JSON.stringify(Object.fromEntries(entries.map(([id, detail]) => [id, details.get(id) || detail]))));
    }
  }
}

export async function prepareLocaleOutput(locales, out) {
  await Promise.all(locales.flatMap(({ code }) => ['wars', 'catalogue', 'borders'].map(dir => mkdir(join(out, 'data', 'locales', code, dir), { recursive: true }))));
}
