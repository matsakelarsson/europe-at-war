# Europe at War

An interactive map of Europe's wars from about 800 to today. Move through the
years to watch borders change, open a war to follow it step by step, or pick a
country to read all of its wars in order.

Live site: https://matsakelarsson.github.io/europe-at-war/

It grew out of [Sweden at War](https://matsakelarsson.github.io/sweden-at-war/),
whose 67 steps are included here as the Sweden view (`#/country/se`).

## How it works

- **Static site.** Vanilla JavaScript and SVG, no framework. The only runtime
  dependency is `topojson-client`, vendored in `site/vendor/`.
- **Atoms.** The map is built from Natural Earth admin-1 regions, cut further
  where history needs finer lines (`content/borders/splits/`). Each atom is
  filled with the colour of its owner on the chosen date, and borders are drawn
  only where neighbouring atoms have different owners.
- **Borders over time.** Drafted keyframes from
  [historical-basemaps](https://github.com/aourednik/historical-basemaps), then
  corrected by hand, plus dated events (treaties, annexations) in
  `content/borders/events/`.
- **Wars.** One YAML file per war in `content/wars/`, with steps, markers,
  arrows and shaded areas, all in longitude and latitude.

See [CONTENT_GUIDE.md](CONTENT_GUIDE.md) for the data formats and how to write
a war.

## Working on it

Needs Node 20 or newer.

```sh
npm install
npm run dev        # build into dist/ and serve it at http://127.0.0.1:8080/
npm run build      # validate content and build dist/ (what CI runs)
```

The build checks every reference (atoms, polities, sides), dates and
coordinates, warns about border flip-flops that have not been reviewed, and
reports the first-load size.

Links into the site use the hash: `#/year/1658`, `#/war/scanian-war/3`,
`#/country/se/35`.

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
| `node tools/rename-polity.mjs muscovy russia` | Rename or merge a polity id across all content |
| `node tools/migrate/sweden.mjs` | One-off import from Sweden at War (already run; refuses to overwrite without `--force`) |

## Deploying

Every push to `main` runs `.github/workflows/pages.yml`, which builds the site
and deploys `dist/` to GitHub Pages.

## Licence and data

Code and content are licensed under the GNU GPL v3.0 or later (see `LICENSE`),
because the border drafts are derived from historical-basemaps (GPL-3.0).

- Borders: [historical-basemaps](https://github.com/aourednik/historical-basemaps)
  by André Ourednik and contributors, GPL-3.0, corrected by hand.
- Regions, coasts, lakes and rivers: [Natural Earth](https://www.naturalearthdata.com/),
  public domain.
- [topojson-client](https://github.com/topojson/topojson-client), ISC licence.

Borders are approximate: modern regions are used as building blocks, so lines
that cut across today's regions are simplified unless a split has been added.
