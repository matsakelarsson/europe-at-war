# Roadmap: the whole world, free on GitHub Pages

The site is going to cover the wars of the whole world, from about 800 to today,
and stay free for everyone on GitHub Pages. This file is the plan. Each batch is
built, tested, checked in a browser, committed and pushed (every push to `main`
deploys), and ticked off here.

## Limits we design for

GitHub Pages ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)):
published site at most 1 GB, repository 1 GB recommended, soft bandwidth limit of
100 GB a month, deployments time out after 10 minutes, no commercial use.

Our own budgets:

- **First load at most 1.2 MB gzip**, whatever the number of wars. The build
  fails above it. This is what keeps the site fast on phones and keeps the free
  bandwidth enough for many visitors.
- **Everything else is loaded when needed**: a war when it is opened, the
  catalogue text of a period when the year list shows it, the border changes of a
  century when the map shows it.
- Site under 300 MB and repository under 500 MB with the whole world in it.

Measured before this plan (478 wars, 3 languages): site 24 MB, repository 12 MB,
first load 1.05 MB gzip (1.41 MB for French and Swedish), build 2 s.

## Phase 1: load data on demand

- [x] **Batch 1: the war catalogue on demand.** `wars.json` keeps only what the
  timeline and the lists need to start (id, name, dates, tier, countries, number
  of steps). Summaries, step titles and sources move to one file per century in
  `data/catalogue/`. The year list loads the centuries it shows; search and the
  country view load what they need on first use. Translations split the same
  way: the per-language index keeps war names only. A size test fails the build
  above the first-load budget. *Done: first load 1.05 → 0.91 MB gzip (French and
  Swedish 1.41 → 1.03); `wars.json` 162 → 16 KB gzip.*
- [x] **Batch 2: the border timeline on demand.** `borders.json` keeps the
  polities and the dates of border changes. The changes themselves and their
  notes move to one file per century in `data/borders/`, each starting from a full
  snapshot, so the map needs only the century it shows. Translated border notes
  split the same way. The tools that read the built timeline read the century
  files. *Done: first load 0.77 MB gzip (French and Swedish 0.79), or 0.82
  (0.91) counting the largest century files, which a visit also needs.*

## Phase 2: a world base map

- [x] **Batch 3: every province of the world is an atom.** `build-geo.mjs` makes
  atoms of all Natural Earth admin-1 regions, in detail where the map is curated
  and coarser elsewhere, within the geometry budget (about 0.8 MB gzip). Owners
  for the new atoms are drafted from historical-basemaps for every keyframe year
  (`npm run draft`, which keeps hand corrections), with automatic polities for
  names that have no curated polity yet. *Done: 4,674 atoms (2,348 new), 137
  modern countries in `content/polities/world.yaml`, about 650 automatic
  polities, recoloured by the new `tools/palette.mjs` so that neighbours stand
  apart. Geometry 0.80 MB gzip (rivers simplified more, polity colours built in
  the browser instead of `polities.css`); first load 1.03 MB gzip, French and
  Swedish 1.12. If later waves push past the budget, the next lever is loading
  the provinces outside the core after the first render (about 270 KB).*
- [x] **Batch 4: a world-ready interface.** The country filter grouped by world
  region; the home view and the start view decided by the war or year in view;
  texts that say "Europe" made neutral where they describe the map; README and
  CONTENT_GUIDE updated (regions, border ranges, how to add a region). *Done:
  the filter is grouped by UN M49 region (`content/borders/countries.json`);
  picking a country out of sight turns the globe to its main territory; leaving
  a war far from Europe keeps the map in that part of the world. Step views and
  arrow curves are worked out around each step's own centre instead of central
  Europe, so they are true anywhere on the globe; this also reframed the
  existing steps in Russia and the Near East (and automatic views now leave
  room for marker names). The map's accessible name is "Historical map"; the
  title and subtitle keep "Europe" until the name is decided (see below), as
  they describe what is on the site.*

## Phase 3: content, one world region at a time

Each wave: curate the region's borders (polities, events, a curated range), write
its wars with parallel writer agents from a shared brief, fact-check the generated
border notes and a sample of wars, translate the catalogue (names, summaries,
step titles) into French and Swedish, then build, check and push. Rough sizes
below are the number of new war entries (tiers A, B and C).

- [x] Wave 7: Iran, Mesopotamia, Arabia, Afghanistan and Central Asia (~80)
  *Done: 101 wars (21 tier A, 53 B, 27 C; 256 steps), from the Fourth Fitna
  (811) to the Yemeni Civil War and the 2026 Iran war (both ongoing, last
  updated 27 November 2026). Borders are curated from 800 in
  `events/iran-central-asia.yaml` and `events/arabia.yaml` (265 events,
  fact-checked), with 70 new polities, 99 capital tenures and 14 labels; `none`
  marks land outside any state. Catalogue text, polity names, border notes,
  capitals and labels are in French and Swedish. Known limits: the Eastern
  Province atom also covers the Empty Quarter, and in Afghanistan Natural
  Earth's `AF-PAR` lies in Panjshir and `AFG-1753` ("Urozgan") is Daykundi.
  Drafts outside the region still show in some steps until their waves: Pakistan
  appears as the Maratha Confederacy in 1842 (wave 8), and the Kazakh steppe as
  "Turan" in the 1860s (wave 9).*
- [x] Keep the first load under budget as the catalogue grows: French and
  Swedish visitors load one translated century file instead of the English one
  plus a translation map, and heavy centuries (the 1900s) are split into
  smaller files. *Needed before wave 8: the French first load reached 1.18 MB
  of the 1.2 MB budget with wave 7.*
  *Done: the build cuts a century whose catalogue or border file would pass
  64 KB or 80 KB of raw JSON (in its largest language) at year boundaries, and
  `borders.json` lists the files (`buckets`). The 1800s and 1900s are now in
  two or three files each. Each language gets complete translated copies, so a
  French visit no longer loads the English text as well. First load: en 1.02 MB
  gzip, fr and sv 1.05 (were 1.05, 1.18 and 1.17). Searching in French or Swedish
  now matches the translated summaries only; war names match in both languages.*
- [ ] Wave 8: South Asia (~100)
- [ ] Wave 9: China, Mongolia, Tibet and the steppe east of the Urals (~120)
- [ ] Wave 10: Korea and Japan (~60)
- [ ] Wave 11: Southeast Asia (~70)
- [ ] Wave 12: North Africa, the Sahel and the Horn of Africa (~70)
- [ ] Wave 13: Africa south of the Sahara (~100)
- [ ] Wave 14: North America and the Caribbean (~100)
- [ ] Wave 15: Central and South America (~100)
- [ ] Wave 16: Oceania, and the non-European theatres of the world wars and of
  wars already on the map (Seven Years' War in India and America, Napoleon in
  Egypt, the Pacific War, the First World War in the Middle East and Africa) (~40
  new, plus new steps)

That is about 850 new wars, roughly 1,300 in all. More can follow at the same
cost per war (about 50 KB of site each, in three languages).

## Later

- Step bodies of the new waves in French and Swedish (they fall back to English
  until then).
- A custom domain, if wanted.

## Open decisions

- **The name.** The site keeps the name "Europe at War" and its address until a
  new name is chosen. Renaming the repository would change the address (GitHub
  Pages does not redirect it), so the repository keeps its name.
