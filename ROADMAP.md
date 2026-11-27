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
- [x] Wave 8: South Asia (~100)
  *Done: 120 wars (30 tier A, 49 B, 41 C; 327 steps), from the Tripartite
  Struggle (786) to the Afghanistan–Pakistan war and the insurgencies still
  going on (last updated 27 November 2026). Borders are curated from 800 in
  `events/south-asia.yaml` (309 events, fact-checked), on 41 new splits for the
  historical regions of Uttar Pradesh, Madhya Pradesh, Maharashtra, Karnataka,
  Rajasthan and others (`splits/98-south-asia.geojson`), with 116 new polities,
  29 war actors, 193 capital tenures and 17 labels. Catalogue text, polity
  names, border notes, capitals and labels are in French and Swedish, and so
  are the names of the world's modern countries, which were still in English.
  `tools/palette.mjs --region` now also keeps apart polities that are shown
  together in a region (near-identical pairs in South Asia: 559 → 175). Known
  limits: small princely states (Bharatpur, Khairpur, Tehri, Rampur) fall
  inside British atoms; Dadra and Nagar Haveli shares an atom with Daman and
  Diu, so it shows as Portuguese until 1961; Aksai Chin has no atom of its own
  and is drawn in war steps only. Site 32 MB, first load 1.03 MB gzip (fr and
  sv 1.07).*
- [x] Wave 9: China, Mongolia, Tibet and the steppe east of the Urals (~120)
  *Done: 156 wars (37 tier A, 61 B, 58 C; 436 steps), from the Tang–Tibetan
  war of 801 to the Xinjiang conflict and the Kazakh unrest of 2022. Borders
  are curated from 800 for China, Mongolia, Taiwan, Hong Kong, Macau, eastern
  Kazakhstan and Siberia (without Sakhalin and the Kurils, which come with
  wave 10), and from 1236 for western Kazakhstan, in `events/east-asia.yaml`
  (278 events, checked by two fact-checkers and against the writers' stories),
  on 45 new splits for the historical regions of Hebei, Shanxi, Gansu, Inner
  Mongolia, Liaoning, Xinjiang, Tibet and the leased territories
  (`splits/99-east-asia.geojson`), with 63 new polities, 80 war actors, 116
  capital tenures and 39 labels. Catalogue text, polity names, border notes,
  capitals and labels are in French and Swedish. Known limits: Derge and the
  1917–1932 Sino-Tibetan line in Kham have no atom of their own; occupations
  (Japan in China 1937–1945, Hong Kong 1941–1945) and the warlord and Communist
  zones are drawn in war steps only. Side move and success labels in war legends
  are still English in French and Swedish for every wave (1,652 strings).
  Site 35 MB, first load 1.05 MB gzip (fr and sv 1.10).*
- [x] Wave 10: Korea and Japan (~60)
  *Done: 100 wars (14 tier A, 38 B, 48 C; 202 steps), from the Emishi wars
  (774–811) to the clashes on the Northern Limit Line (1999–2010), with the
  Imjin War, the Korean War, the Genpei, Ōnin and Boshin wars and the Soviet
  landings on South Sakhalin and the Kurils. Borders are curated from 800 for
  Korea, Japan, the Ryukyu Islands, Sakhalin and the Kurils in
  `events/korea-japan.yaml` (58 events, checked by two fact-checkers), on 11
  new splits (South Sakhalin, the southern and northern Kurils, the Matsumae
  tip of Hokkaido, the Amami and Sakishima Islands, Yonghung, and the land on
  each side of the 38th parallel; `splits/99b-korea-japan.geojson`), with 13
  new polities, 85 war actors, 24 capital tenures and 11 labels. Japan is one
  state throughout; the American and Soviet military governments in Korea
  (1945–1948) and the American administration of the Ryukyus (1946–1972) are
  on the base map as the map of their time. Catalogue text, polity names,
  border notes, capitals and labels are in French and Swedish. Known limits:
  the old provinces and daimyo domains of Japan do not match today's
  prefectures, so domains and fronts are drawn approximately; battles fought
  within a few kilometres are told with one or two markers, because the map
  cannot zoom in further; German and Japanese Micronesia (1885–1944), which
  the Siege of Tsingtao touches, waits for Oceania (wave 16). Site 39 MB,
  first load 1.06 MB gzip (fr and sv 1.11).*
- [x] Wave 11: Southeast Asia (~70)
  *Done: 155 wars (31 tier A, 68 B, 56 C; 428 steps), from the Nanzhao raids
  on the Pyu (832–835) to the battle of Marawi (2017), with the Mongol
  invasions of Đại Việt, the Forty Years’ War, the Burmese–Siamese wars, the
  Tây Sơn wars, the Java and Aceh wars, the Philippine Revolution and the
  Philippine–American War, the Second World War in Burma, Malaya and the
  Philippines, the Indochina wars and the conflicts in Myanmar. Borders are
  curated from 800 for Myanmar, Thailand, Laos, Cambodia, Vietnam, Malaysia,
  Singapore, Brunei, Indonesia, the Philippines and Timor-Leste in
  `events/southeast-asia.yaml` (252 events, checked by two fact-checkers),
  on 25 new splits (`splits/99c-southeast-asia.geojson`), with 100 new
  polities, 100 war actors, 155 capital tenures and 24 labels. Protectorates
  and vassals keep their own colour until annexed; the Viet Minh zones, the
  Indonesian Republic of 1945–1949 and the First Philippine Republic are war
  areas, not base-map states; the Thai gains of the Tokyo convention
  (1941–1946) and Indonesian rule in East Timor (1976–1999) are on the base
  map. Catalogue text, polity names, border notes, capitals and labels are in
  French and Swedish. Known limits: the Balinese kingdoms (Karangasem, Badung,
  Tabanan and the rest) share one area, and Pagan has no split of its own;
  the Paracel and Spratly Islands and the Banda Islands have no land on the
  map, so the Banda war is told with markers and a drawn outline; steps whose
  places lie a few kilometres apart (Singapore 1942, Banda, Badung) use close
  views. Site 45 MB, first load 1.07 MB gzip (fr and sv 1.13).*
- [x] Wave 12: North Africa, the Sahel and the Horn of Africa (~70)
  *Done: 129 wars (43 tier A, 54 B, 32 C; 454 steps), 124 new and 5
  rewritten, from the Fatimid conquest of Ifriqiya (902–909) to the war in
  Amhara and the Sudanese civil war (both ongoing), with the Almoravid and
  Almohad wars, the Hilalian invasion, the Ethiopian–Adal war, the Moroccan
  invasion of Songhai, the Barbary wars, the French conquests of Algeria, the
  western Sudan and Morocco, the Mahdist war, the Italian wars in Libya and
  Ethiopia, the North African campaign, the Algerian War, the Western Sahara,
  Eritrean and Ogaden wars, the civil wars of Chad, Sudan, Somalia and Libya
  and the wars in Mali and Burkina Faso. Borders are curated from 800 for
  Morocco, Western Sahara, Algeria, Tunisia, Libya, Mauritania, Mali, Niger,
  Chad, Sudan, South Sudan, Eritrea, Djibouti, Ethiopia, Somalia and
  Somaliland in `events/north-africa-horn.yaml` (296 events, checked by two
  fact-checkers), on 14 new splits (`splits/99d-north-africa-horn.geojson`),
  with 74 new polities, 103 war actors, 119 capital tenures and 33 labels.
  The Ottoman regencies of Algiers and Tunis are their own polities, Tripoli
  under the Karamanli (1711–1835); Italian East Africa is shown in Ethiopia
  1936–1941 and in Eritrea and Somalia until the 1947 peace treaty, and
  Italian Libya likewise until 1947; Western Sahara is one territory from
  February 1976 and Somaliland is shown on its own from May 1991. Mahdist
  conquests before the fall of Khartoum, rebel zones and the jihadist areas
  of the Sahel are war areas. Catalogue text, polity names, border notes,
  capitals and labels are in French and Swedish. Known limits: Samori’s
  Wassoulou, Rabih’s Bornu and the Boko Haram war reach into wave 13 lands
  and wait for it; Congo and Tanzania still show inherited names there.
  First load 1.09 MB gzip (fr 1.16, sv 1.15), close to the 1.2 MB budget.*
- [x] Keep the first load from growing with war actors: `borders.json` and the
  language indexes carry only the polities the map can draw (owners in the
  border timeline and states of capitals). The armies, rebels and coalitions
  that only war sides name stay out, since the site never draws them.
  *Needed before wave 13: the French first load reached 1.16 MB with wave 12.
  Done: 2,053 polities, 1,418 shipped; first load en 1.07 MB gzip, fr and sv
  1.13 (were 1.09, 1.16 and 1.15). Translations are still checked against
  every polity, so a translated actor name is not an error.*
- [x] Wave 13: Africa south of the Sahara (~100)
  *Done: 142 wars (35 tier A, 59 B, 48 C; 381 steps), 141 new and the
  Portuguese Colonial War rewritten, from the Hausa wars (from about 1450) to
  the wars in Kivu, Cabo Delgado and the Anglophone regions of Cameroon (all
  ongoing), with the Portuguese wars in Kongo, Ndongo, Mutapa and on the
  Swahili coast, the rise of Asante, Dahomey and the Zulu kingdom, the Fulani
  jihads, the Xhosa and Boer wars, the conquests of the scramble for Africa,
  the Herero and Nama genocide, Maji Maji, the African campaigns of the First
  World War, Mau Mau, the wars of independence in Portuguese Africa and
  Rhodesia, the Congo crisis, Biafra, apartheid and the border war, the
  genocide against the Tutsi and the Congo wars, the Liberian and Sierra
  Leonean civil wars and the Boko Haram insurgency. Borders are curated from
  800 for every country south of the Sahara in `events/africa-south.yaml`
  (364 events, checked by two fact-checkers), on 32 new splits
  (`splits/99e-africa-south.geojson`: the Swahili and Mozambique coasts,
  Lunda, Luba and Kasanje, Zululand and the New Republic, British
  Bechuanaland, the Conquered Territory and others), with 114 new polities,
  133 war actors, 207 capital tenures and 27 labels. A state keeps its own
  colour until it is conquered or absorbed, not when it signs a protectorate
  treaty; German colonies become mandates on 10 January 1920; Rhodesia is
  shown under Zimbabwe’s names. Catalogue text, polity names, border notes,
  capitals and labels are in French and Swedish. Known limits: tribute is
  not shown, nor bantustans or rebel states (Biafra, Katanga), which are war
  areas; Neukamerun is approximated by four provinces, and Northern
  Cameroons, German Dagbon, Mayotte, Witu, Venda and Barue are not shown.
  First load 1.09 MB gzip (fr and sv 1.15).*
- [x] Wave 14: North America and the Caribbean (~100)
  *Done: 153 wars (28 tier A, 70 B, 55 C; 432 steps), 152 new and the
  Spanish–American War rewritten, from the Norse in Vinland (about 1003) and
  the Tepanec War (1428) to the Mexican drug war and the gang war in Haiti
  (both ongoing), with the Aztec wars, the Spanish conquests of the
  Caribbean, the Aztec Empire, the Tarascan state and Yucatán, the Beaver
  Wars and the colonial wars of New France, New England and New
  Netherland, the Pueblo Revolt, the French and Indian War, the American
  Revolutionary War, the Haitian Revolution, the War of 1812, the Mexican
  and Cuban wars of independence, the Texas Revolution and the
  Mexican–American War, the wars against the Native nations from the
  Seminole wars to Wounded Knee, the American Civil War, the Caste War of
  Yucatán, the French intervention in Mexico, the North-West Rebellion,
  the Mexican and Cuban revolutions, the American occupations in the
  Caribbean and the crises of the Cold War. Borders are curated from 800
  for Mexico, the United States (without Hawaii), Canada, Bermuda and the
  Caribbean in `events/north-america.yaml` (192 events, checked by two
  fact-checkers), on 23 new splits (`splits/99f-north-america.geojson`: the
  1783 line, the Red River basin, the Continental Divide, the Adams–Onís
  line, the Nueces Strip, the Gadsden Purchase, the Florida Parishes and
  the West Florida coast, southern Quebec and Ontario, Labrador, Cape
  Breton, Vancouver Island, the Mixteca and the Delaware valley), with 38
  new polities, 146 war actors, 81 capital tenures and 38 labels. The
  Native nations north of Mexico are not on the base map (the provinces
  are too coarse) and appear in the wars as areas; a colony is shown from
  its first lasting settlement, other land from the treaty or formal
  claim; rebel governments are war areas, except the Republic of Texas;
  wartime occupations are war areas, except the American military
  government of Cuba (1899–1902). Catalogue text, polity names, border
  notes, capitals and labels are in French and Swedish. Known limits: Cape
  Breton as a separate colony (1784–1820) and French Plaisance in
  Newfoundland are not shown; Central America follows in wave 15 and
  Hawaii in wave 16. First load 1.10 MB gzip (fr and sv 1.17).*
- [ ] Wave 15: Central and South America (~100)
- [ ] Wave 16: Oceania, and the non-European theatres of the world wars and of
  wars already on the map (Seven Years' War in India, Napoleon in Egypt, the
  Pacific War, the First World War in the Middle East and Africa) (~40 new,
  plus new steps); the Second World War in Burma, Malaya, the Dutch East
  Indies and the Philippines came with wave 11, and the French and Indian War
  with wave 14

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
