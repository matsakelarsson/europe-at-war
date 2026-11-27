# Europe at War

An interactive map of Europe's wars from about 800 to today. Move through the
years to watch borders change, open a war to follow it step by step, or pick a
country to read all of its wars in order.

Live site: https://matsakelarsson.github.io/europe-at-war/

It grew out of [Sweden at War](https://matsakelarsson.github.io/sweden-at-war/),
whose 67 steps are included here as the Sweden view (`#/country/se`).

## How it works

- **Static site.** Vanilla JavaScript, canvas and SVG, no framework. The only
  runtime dependency is `topojson-client`, vendored in `site/vendor/`.
- **A globe.** The map is a globe you can turn and zoom (`site/globe.js`).
  Borders cover the whole world: hand-curated for Europe, the Near East, Iran,
  Arabia and Central Asia, drafted from historical-basemaps elsewhere. Wars and
  capitals cover the same regions so far; [ROADMAP.md](ROADMAP.md) has the plan
  for the rest of the world.
- **Atoms.** The map is built from all of Natural Earth's admin-1 regions
  (provinces, states, counties), cut further where history needs finer lines
  (`content/borders/splits/`). Atoms in Europe and around it keep the most
  detail; the rest of the world is simplified more. Each atom is
  filled with the colour of its owner on the chosen date, and borders are drawn
  only where neighbouring atoms have different owners.
- **Borders over time.** Drafted keyframes from
  [historical-basemaps](https://github.com/aourednik/historical-basemaps), then
  corrected by hand, plus dated events (treaties, annexations) in
  `content/borders/events/`.
- **Wars.** One YAML file per war in `content/wars/`, with steps, markers,
  arrows and shaded areas, all in longitude and latitude. The country filter
  groups countries by world region (UN M49).
- **Loaded when needed.** A first visit loads the map, the polities, the dates
  of all border changes and a short catalogue of wars (names, dates,
  countries). Everything else comes in pieces as the reader needs it: a war's
  steps when it is opened (`data/wars/`), war summaries and step titles per
  century (`data/catalogue/`), and border changes and their notes per century
  (`data/borders/`). The build fails if a first visit would load more than
  1.2 MB gzip; see [ROADMAP.md](ROADMAP.md).

See [CONTENT_GUIDE.md](CONTENT_GUIDE.md) for the data formats and how to write
a war.

## What the map shows

The same rules apply to every border and every war:

- **Recognised borders on the base map.** The coloured map shows the borders
  states recognised at the time, by treaty or in practice. Military
  occupations, breakaway regions and front lines are drawn as shaded areas in
  a war's steps, not on the base map. So Crimea after 2014, the occupied parts
  of Ukraine, Abkhazia, South Ossetia, Transnistria and Karabakh stay with the
  state they are recognised as part of. The few exceptions, where an occupation
  lasted long enough to be the map of its time, are listed under
  [Borders](CONTENT_GUIDE.md#borders) in the content guide.
- **Neutral wording.** Wars are described plainly, giving every side its due,
  without national framing. The stories migrated from Sweden at War are told
  from Sweden's side and say so.
- **Sourced.** Every war lists sources a reader can open. Where sources
  disagree on a date or number, the text says so.
- **Approximate.** Modern regions are used as building blocks, so lines that
  cut across today's regions are simplified unless a split has been added.

A correction that applies these rules is welcome as an issue. A case for
changing a rule itself belongs in
[Discussions](https://github.com/matsakelarsson/europe-at-war/discussions),
because it changes the map everywhere.

## Corrections and contributions

Found a wrong border, date or fact? Open a
[correction](https://github.com/matsakelarsson/europe-at-war/issues/new/choose)
with a source. To change the content yourself, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Working on it

Needs Node 20 or newer.

```sh
npm install
npm run dev        # reuse validated data and preview site/ at http://127.0.0.1:8080/
npm run build      # validate content and build dist/ (what CI runs)
```

The build checks every reference (atoms, polities, sides), dates and
coordinates, warns about border flip-flops that have not been reviewed, and
reports the first-load size.

Links into the site use the hash: `#/year/1658`, `#/war/scanian-war/3`,
`#/country/se/35`.

### Languages

Use the language selector or add `?lang=en`, `?lang=fr` or `?lang=sv` before the
hash in a link, for example `?lang=fr#/war/first-bremen-war/1`. Without an
explicit URL language, the site uses the saved selection, then the browser
preference, then English. The interface is available in English, French and
Swedish. French covers the historical catalogue, including the stories and map text.
Some French historical text was generated using offline machine translation.
Swedish covers selected historical content, with English as the fallback.
See the [translation guide](CONTENT_GUIDE.md#translations).

### Rebuilding the geometry (rarely needed)

The projected geometry (`site-data/atoms.topo.json`, `content/borders/atoms.json`)
and the keyframes are committed, so a normal build needs no downloads. To change
the atoms, for example after adding a split:

```sh
npm run fetch-data   # Natural Earth + historical-basemaps into .cache/ (about 100 MB)
npm run geo          # rebuild atoms from Natural Earth and the splits
npm run draft        # fill keyframe gaps for new atoms (never overwrites existing assignments)
```

### Tools

| Command | What it does |
| --- | --- |
| `node tools/set-owner.mjs 1530,1600 russia RU-PSK` | Hand-correct atoms in drafted keyframes |
| `node tools/palette.mjs world.yaml --auto` | Recolour polities so that neighbours stand apart (after a build) |
| `node tools/rename-polity.mjs muscovy russia` | Rename or merge a polity id across all content |
| `node tools/split-from-hb.mjs 30-poland 1880 Germany memel "Memel land" LT-KL` | Cut atoms along a historical-basemaps border |
| `node tools/owners-at.mjs 1772-08-06 poland prussia` | Who owns which atoms on a date (after a build) |
| `node tools/owner-history.mjs '^PL-PM'` | Every owner change of matching atoms, with its source |
| `node tools/box.mjs 21 52 1500` | A `?box=` value for opening the map on an area |
| `node tools/migrate/sweden.mjs` | One-off import from Sweden at War (already run; refuses to overwrite without `--force`) |
| `tools/migrate/*.mjs` (others) | One-off corrections, already applied; kept as a record |

## Deploying

Every push to `main` runs `.github/workflows/pages.yml`, which builds the site
and deploys `dist/` to GitHub Pages.

## Licence and data

Code and content are licensed under the GNU GPL v3.0 or later (see `LICENSE`),
because the border drafts are derived from historical-basemaps (GPL-3.0).
Contributions are accepted under the same licence.

- Borders: [historical-basemaps](https://github.com/aourednik/historical-basemaps)
  by André Ourednik and contributors, GPL-3.0, corrected by hand.
- Regions, coasts, lakes and rivers: [Natural Earth](https://www.naturalearthdata.com/),
  public domain.
- [topojson-client](https://github.com/topojson/topojson-client), ISC licence.
