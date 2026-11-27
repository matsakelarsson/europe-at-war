# Content guide

How to add and edit wars, borders and polities. Everything lives in `content/`
as YAML or JSON. Run `npm run build` after editing: it validates everything
and tells you what is wrong and where. `node tools/build.mjs --check` validates
without writing `dist/`.

## Schema version

The file formats in this guide are **schema v1**, frozen on 2026-11-18 after
the Denmark–Norway and Poland pilot. Adding an optional field is fine.
Renaming or removing a field, or changing what one means, needs a migration
script in `tools/migrate/` that updates every file, and a note here.

## Principles

- **Neutral and plain.** Describe what happened and who did it. Avoid national
  framing ("our", "heroic", "treacherous") unless quoting. Migrated Sweden at
  War stories are told from Sweden's side and say so in their notes; new wars
  should give every side its due.
- **Sourced.** Every war lists its sources. Prefer sources a reader can open
  (Wikipedia, Britannica, academic or museum sites). When sources disagree on a
  number or date, say so in the text ("about", "some estimates") rather than
  picking one silently.
- **Dates and calendars.** Write dates as the sources usually give them, and
  add a note to the war when calendars differ (Old Style/New Style, or the
  Swedish calendar of 1700–1712).
- **Ongoing wars.** Set `end: ongoing`, and start the last step's body with
  "Last updated <date>." Update the date whenever the step is revised.
- **Borders are approximate.** Do not add precision the atoms cannot show.
  If a border matters to a story and no atom line follows it, add a split.

## Content tiers

| Tier | What it has |
| --- | --- |
| A | Full story, 5–20 steps (the world wars and a few long wars have more) |
| B | Short story, 1–3 steps |
| C | Catalogue entry only: dates, sides, one-paragraph `summary`, sources. Steps may be omitted or have no body. |

Write tier C entries for a region's wars first, then upgrade the important ones.
A tier C entry needs `summary` and `sources`; it may have no steps, and is then
shown as a card in the war list instead of a link.

## Wars: `content/wars/<startyear>-<id>.yaml`

One file per war. A war shared by several countries is one file; tag each step
with the `countries` it involves so country views only show relevant steps.

```yaml
id: scanian-war              # used in links: #/war/scanian-war
name: Scanian War
start: "1674"                # YYYY, YYYY-MM or YYYY-MM-DD (quote it)
end: "1679"                  # or ongoing
tier: A
summary: One paragraph for the catalogue and search.
countries: [se, dk, no, de]  # optional; derived from the sides' polities if left out
sides:
  - id: se                   # referenced by markers, arrows, areas
    name: Sweden
    polities: [sweden]       # polity ids; shown in full colour, others are muted
    ink: blue                # optional; default is the first polity's ink
    moves: Swedish and allied moves     # legend text for this side's arrows
    success: Swedish success            # legend text for this side's markers
notes:
  - Calendar or other caveats, shown under the story.
sources:
  - title: Scanian War (Wikipedia)
    url: https://en.wikipedia.org/wiki/Scanian_War
steps:
  - title: Lund, the bloodiest battle
    date: 1676–1677          # shown as written
    when: "1676"             # sort date for country views; default: first year in `date`
    borders: "1676-12-04"    # border state to show; default: `date`
    countries: [se, dk]      # optional, for country views
    view:                    # optional; default fits markers, arrows and areas
      center: [13.4, 55.8]   # lon, lat
      size: [420, 360]       # width, height in km
    body:
      - First paragraph.
      - Second paragraph.
    facts:
      - [Battle of Lund, "4 December 1676, Swedish victory"]   # label, value
    link: { href: https://…, text: Read more }   # optional
    markers:
      - kind: battle         # battle naval siege held taken event treaty toll air capital
        side: se             # whose success it was (or none)
        name: Battle of Lund
        date: 4 December 1676
        text: Popup text.
        lonlat: [13.19, 55.70]
        lp: r                # label position: r (right, default), l, t or b
    arrows:
      - side: se
        label: Charles XI
        phase: 1                                             # optional relative playback order
        via: [[13.8, 56.6], [13.5, 56.1], [13.2, 55.75]]   # smooth curve through points
        # or bezier: [p0, c1, c2, p1, c1, c2, p2, …]         # 1 + 3n points
        label_at: [13.9, 56.2]                              # optional label position
    areas:
      - style: occupied      # occupied gained pledged lost outline contested front
        side: dk             # colour and hatch come from the side's ink
        label: Occupied by Denmark–Norway                   # legend text
        atoms: [SE-M]        # atom ids (an id includes all its splits; "DK-83!" means without them)
      - style: occupied      # a zone that does not follow atoms
        side: de
        polygon: [[14.1, 52.1], [15.0, 52.4], [14.6, 51.6]]   # [lon, lat] ring; or polygons: [ring, …]
      - style: front         # a front line, drawn in the side's ink
        side: pl
        label: Front, 13 August 1920
        line: [[20.1, 53.2], [21.0, 52.4], [21.6, 51.8]]      # or lines: [line, …]
```

Without a `view`, the build frames everything the step shows (markers,
arrows, areas) and leaves room for marker names and the zoom buttons. Views
and arrow curves are worked out in kilometres around the step's own centre, so
they are as true in Japan or Peru as in Europe.

Shared wars: a war told from several sides is one file. When adding steps to a
file migrated from Sweden at War, set `countries` on the new steps and leave
`se` out unless the step is about Sweden, so the Sweden view keeps its 67 steps.
Per-step `side_names` and `move_names` (maps from side id to text) override the
legend wording for one step.

Use arrow `phase` to show a sequence supported by historical sources. Give
each leg of a continuing route a later phase, and give overlapping movements
the same phase. A phase can cover a broad period when exact dates are unclear.
If a step uses phases, assign every arrow a positive integer and use
consecutive numbers starting at 1. Add the references to the war’s sources.

Text containing a colon followed by a space (`: `) must be quoted, or YAML reads
it as a mapping and the page would show "[object Object]". Use double quotes and
keep typographic quotes (“ ”) inside. The build rejects unquoted cases in names,
summaries, notes, step titles, dates, body paragraphs, facts and marker text.

### Per-war checklist

- [ ] `id`, `name`, `start`, `end`, `tier`, `summary`, at least one source
- [ ] Sides list every combatant polity that appears on the map
- [ ] Each step has a `borders` date that shows the map as it was then
- [ ] Border changes from the peace are in `content/borders/events/`, not only in the text
- [ ] Markers and arrows checked on the map at desktop and phone widths
- [ ] `npm run build` passes with no new warnings

## Polities: `content/polities.yaml`

A polity is anything that owns land on the map.

```yaml
- id: russia
  name: Russia                         # current name
  names: [["1547", Grand Duchy of Moscow], ["1721", Tsardom of Russia]]   # earlier names: [until, name]
  color: "#d3dccd"                     # light pastel; dark mode is derived
  ink: green                           # strong colour for arrows, hatching, markers
  countries: [ru]                      # modern countries it belongs to (for country views)
  aliases: [Russian Empire, RUS]       # historical-basemaps names / Natural Earth codes
  label: [37.6, 55.8]                  # optional preferred label position(s)
```

- Inks: blue red purple orange green teal brown magenta gold slate navy olive none.
- Topic files in `content/polities/*.yaml` (same format) are read together with
  `polities.yaml`; ids and aliases must be unique across all of them.
- `content/polities.auto.yaml` is generated by `npm run draft` for
  historical-basemaps names without a curated polity. To curate one, move it to
  `polities.yaml` and fix it. A curated polity that takes over all of an auto
  polity's aliases replaces it everywhere.
- One continuous state is one polity with dated `names`, not several. To merge
  polities, add the aliases to the one you keep, then run
  `node tools/rename-polity.mjs <old> <kept>`.

## Borders

The owner of an atom on a date is the most recent assignment on or before that
date, from two sources merged by date:

1. **Keyframes**, `content/borders/keyframes/<year>.json`, drafted from
   historical-basemaps snapshots (and Natural Earth for today). They are drafts:
   correct them with `node tools/set-owner.mjs <years> <polity> <atoms…>`.
2. **Events**, `content/borders/events/*.yaml`: dated changes, usually treaties.

Every admin-1 region in the world is an atom. Outside the curated ranges below,
owners are historical-basemaps drafts, with automatic polities
(`content/polities.auto.yaml`) for names that have no curated polity yet, and
modern countries in `content/polities/world.yaml`. Events outside the curated
regions go in `events/world.yaml` until a region gets its own file. After
adding or renaming polities, `node tools/palette.mjs <polities file> --auto`
(after a build) gives the new ones colours that stand apart from everything
they ever border, keeping curated colours.

```yaml
- date: "1658-02-26"
  note: Treaty of Roskilde.
  owners:
    sweden: [SE-M, SE-K, SE-N, DK-84~bornholm]
    "-": [XX-1]          # "-" means: fall back to the drafted keyframes
    none: [XX-2]         # no state: plain land (tribal lands, deserts)
```

- `content/borders/curated.yaml` lists date ranges in which keyframes are
  ignored for some atoms, so that hand-made borders are not overridden by
  drafts. Inside a curated range **every** change must be an event; nothing
  else will move the border. Curated so far:

  | Range | Atoms | Events in |
  | --- | --- | --- |
  | 1240–1815 | Sweden at War's map (Nordic, Baltic, Polish and Russian lands; in Germany only Swedish Pomerania, Bremen-Verden and Schleswig-Holstein) | `sweden-at-war.yaml` |
  | 1240–today | Germany, Austria, the Czech lands, Switzerland, Liechtenstein, South Tyrol and Trentino (from 1815 also Swedish Pomerania and Bremen-Verden) | `german-lands.yaml` |
  | 1815–today | Sweden, Norway, Denmark | `denmark.yaml` |
  | 800–today | Iceland, the Faroes, Greenland, Svalbard, Jan Mayen | `denmark.yaml` |
  | 1815–1945 | Schleswig-Holstein | `denmark.yaml` |
  | 1772–today | Poland, Lithuania, Latvia, Estonia, Belarus, Kaliningrad, right-bank Ukraine | `poland-lithuania.yaml` |
  | 800–today | Outer Hebrides, Orkney, Shetland, the Isle of Man | `british-isles.yaml` |
  | 800–today | Great Britain, Ireland, Jersey, Sark | `british-isles.yaml` |
  | 1066–today | France, Belgium, the Netherlands, Luxembourg | `france-low-countries.yaml` (also `central-europe.yaml` for Alsace-Lorraine, `italy.yaml` for Savoy and Nice 1860, `ww2.yaml` for 1940–1945) |
  | 800–today | Spain, Portugal, Andorra | `iberia.yaml` (Roussillon is in `france-low-countries.yaml`) |
  | 800–today | Italy (without Trentino and South Tyrol), San Marino, Malta, Monaco | `italy.yaml` |
  | 800–1236 | European Russia, left-bank and southern Ukraine and western Kazakhstan (to 1240 also Belarus, right-bank Ukraine and the Karelian and Ingrian atoms) | `rus-and-russia.yaml` |
  | 1236–today | European Russia and left-bank and southern Ukraine | `rus-and-russia.yaml`, `russia.yaml`, `ww2-east.yaml` |
  | 800–1801 | Georgia, Armenia, Azerbaijan, the northern Caucasus and Iranian Azerbaijan (East and West Azerbaijan, Ardabil) | `caucasus.yaml` |
  | 1801–today | Georgia, Armenia, Azerbaijan, the northern Caucasus, Kars–Ardahan–Artvin | `caucasus.yaml` |
  | 1809–today | Finland and Åland | `finland.yaml` |
  | 1812–today | Bessarabia and Transnistria (Moldova, Budjak, Khotyn) | `bessarabia.yaml` |
  | 800–1812 | Moldavia east of the Prut, the Budjak, Transnistria, Khotyn and Northern Bukovina | `balkans.yaml` (with `bessarabia.yaml` and `rus-and-russia.yaml`) |
  | 800–today | Hungary, Slovakia, Romania, the former Yugoslavia, Albania, Greece, Bulgaria, Cyprus, Turkey (without Kars, Ardahan, Artvin and Iğdır before 1801) and Carpathian Ruthenia | `balkans.yaml`, `anatolia.yaml` (Anatolia, and Turkey from 1922), `ww2.yaml` (1941–1945) |
  | 800–1801 | Kars, Ardahan, Artvin and Iğdır | `anatolia.yaml` |
  | 800–today | Syria, Lebanon, Israel, Palestine, Jordan, Egypt | `levant.yaml` |
  | 800–today | Iran (without Azerbaijan before 1801), Iraq, Afghanistan, Uzbekistan, Turkmenistan, Tajikistan, Kyrgyzstan | `iran-central-asia.yaml` (`russia.yaml` for 1991) |
  | 1801–today | Iranian Azerbaijan (East and West Azerbaijan, Ardabil) | `iran-central-asia.yaml` |
  | 800–today | Saudi Arabia, Yemen, Oman, the United Arab Emirates, Qatar, Bahrain, Kuwait | `arabia.yaml` |
  | 800–today | India, Pakistan, Bangladesh, Sri Lanka, Nepal, Bhutan, the Maldives | `south-asia.yaml` |
  | 800–today | China, Mongolia, Taiwan, Hong Kong, Macau, eastern and southern Kazakhstan, Siberia without Sakhalin and the Kurils | `east-asia.yaml` (`russia.yaml` for 1917 and 1991) |
  | 800–today | Korea, Japan, the Ryukyu Islands, Sakhalin and the Kurils | `korea-japan.yaml` |
  | 800–today | Myanmar, Thailand, Laos, Cambodia, Vietnam, Malaysia, Singapore, Brunei, Indonesia, the Philippines and Timor-Leste | `southeast-asia.yaml` |
  | 800–today | Morocco, Western Sahara, Algeria, Tunisia, Libya, Mauritania, Mali, Niger, Burkina Faso, Chad, Sudan, South Sudan, Eritrea, Ethiopia, Djibouti, Somalia and Somaliland | `north-africa-horn.yaml` |
  | 1236–today | Western Kazakhstan (West Kazakhstan, Atyrau, Aktobe, Mangystau, Kostanay) | `east-asia.yaml`, `rus-and-russia.yaml` (1242, 1440), `russia.yaml` |

  Other event files (`central-europe.yaml`) correct drafts outside any curated range; there, the next keyframe can
  still override an event. `central-europe.yaml` is a first pass made for the
  Russia wave's maps (historical-basemaps has no snapshot between 1815 and
  1880) and now only holds Austria-Hungary's Austrian half (Istria, Trieste,
  Gorizia, Bohemia, Galicia) and Alsace-Lorraine. Wave 5 rewrote `balkans.yaml`
  and replaced `turkey.yaml` with `anatolia.yaml`. `italy.yaml` still lists Venetian Istria and
  Dalmatia in 1797 and 1805 and Italian Libya from 1912 (`libya-it`, also fixed in
  the 1914 and 1938 keyframes by `tools/migrate/libya-keyframes.mjs`), and `iberia.yaml` ends with three North African
  events (1031, 1069, 1147) that correct the drafts until the next keyframe. `german-lands.yaml` also
  opens with a few events before 1240 (907, 948, 962, 976, 983) that correct
  the drafts until the next keyframe, and `france-low-countries.yaml` does the
  same before 1066 (Verdun 843, Brittany 851, the kingdoms of Burgundy 879/888,
  Ribemont 880, Lotharingia in the Empire 962, Burgundy in the Empire 1033).
- **What the base map shows.** The base map follows the borders states
  recognised at the time, by treaty or in practice. Military occupation,
  breakaway regions and front lines are drawn as areas in a war's steps,
  not on the base map. Exceptions, where an occupation lasted long enough to
  be the map of the time: the German and Romanian occupation of the Soviet
  Union in 1941–1944 (at six dates in `ww2-east.yaml`, as the Reichskommissariats
  and the military zone), the Finnish reconquest of 1941–1944, and, in
  `ww2.yaml`, the German annexations of Eupen-Malmedy, Alsace-Moselle and
  Luxembourg, the partition of Yugoslavia in 1941–1945 (the Independent State
  of Croatia, the annexations, German-occupied Serbia and Italian-occupied
  Montenegro, each region returning to Yugoslavia when it was liberated) and the
  Bulgarian annexation in Greece; and, in `korea-japan.yaml`, the American
  and Soviet military governments in Korea (1945–1948) and the American
  administration of the Ryukyu and Amami Islands (1946–1972); and, in
  `southeast-asia.yaml`, the lands Thailand gained by the Tokyo convention
  (1941–1946) and the Indonesian annexation of East Timor (1976–1999). The
  Japanese occupation of Southeast Asia (1941–1945), the Thai annexations of
  1943 in Malaya and the Shan states, the Indonesian Republic of 1945–1949,
  the Viet Minh, Pathet Lao and Khmer Rouge zones before 1975 and the
  First Philippine Republic are areas. In `north-africa-horn.yaml`
  Italian East Africa holds Ethiopia from 1936 to 1941 (the Ethiopian
  resistance is an area), and Western Sahara is one territory from 1976
  (Moroccan, Mauritanian and Polisario control are areas); Abd al-Qadir's
  state in Algeria, the Rif Republic, the Dervish state, Azawad and the
  zones held by rebels and jihadist groups in the Sahel are areas.
  Somaliland, which no United Nations member recognised until Israel did in
  2025, is shown on its own from 1991 because it has governed itself since. Occupied France, the Low Countries, Denmark,
  Norway, Greece, Albania after 1943, Italy after the armistice and Hungary
  in 1944 are areas. Abkhazia,
  South Ossetia, Transnistria, Karabakh, Crimea after 2014 and the occupied
  parts of Ukraine stay with the state they are recognised as part of.
  Germany's 1938–1939 annexations, the Protectorate of Bohemia and Moravia,
  the Napoleonic satellites and annexations, and the Allied occupation zones
  of Germany (1945–1949) and Austria (1945–1955, with Vienna under four-power
  rule like Berlin) are on the base map.
- **Protectorates and vassals** keep their own polity until they are annexed
  or ruled directly: Bukhara and Khiva, Hyderabad and the princely states,
  Joseon until 1910, Tunisia, and in Southeast Asia Annam, Cambodia, Luang
  Prabang, the Malay states, Brunei, Sulu (until 1904), Yogyakarta and
  Surakarta, and the Lao and Malay vassals of Siam; in Africa Tunisia and
  Morocco under French protection (1881, 1912), Baguirmi, Darfur under the
  Condominium (1898–1916), Aussa as a tributary of Ethiopia (1896–1936),
  the Bulala under Bornu, the Somali sultanates of Hobyo and Majeerteen
  until Italy's conquest, and the Midrarids under the Fatimids. Colonies ruled directly
  take the colonial power's polity.
- **The Holy Roman Empire.** Until 1500 the Empire is one polity (`hre`), with
  Bohemia, Habsburg Austria (from 1282) and the Swiss Confederacy (from 1291)
  separate. From the Diet of Augsburg (1500-07-02) the larger territorial
  states are shown; the many small states (ecclesiastical states, imperial
  cities, counts) stay grouped as `hre` until 1803–1806. Habsburg Hungary,
  Bohemia and the Austrian lands are one polity (`habsburg`) from 1526.
  The Low Countries follow the same rule until they pass to Burgundy
  (1384–1443); Liège, Lorraine and Habsburg Upper Alsace are shown from 1500.
- **France** is one kingdom: the great fiefs (Normandy, Aquitaine, Champagne…)
  are not shown, except the lands of the English crown (Normandy 1066–1144, the
  Angevin lands 1154–1204/24, Gascony to 1453, the Brétigny lands 1360–1372,
  Lancastrian France 1419–1450, Calais 1347–1558), Brittany (to 1532), Flanders
  (to 1384), Toulouse (to 1229/1271) and the Valois Burgundian state
  (1363–1477). Imperial and foreign lands are separate until they joined France.
- **Iberia.** Córdoba (emirate, caliphate 929, taifa 1031); Asturias/León,
  Castile (joined with León 1037–1065, 1072–1157 and from 1230), Pamplona/Navarre,
  the Catalan counties (Frankish to 988) and Aragon (Crown of Aragon from 1137),
  Portugal (1128); the taifas after 1031, the Almoravids (1086–1147), the
  Almohads (1147–1228), Ibn Mardanish's and Ibn Hud's Murcia, Niebla and Nasrid
  Granada (1238–1492). A province changes hands with its main town. Castile and
  Aragon become `spain` on 1516-01-23; Portugal stays Portugal in 1580–1640.
  Gibraltar is too small to be an atom (use a marker or a polygon area).
- **Italy.** Carolingian to 888, the Kingdom of Italy to 962, then `hre` until
  Frederick II's death (1250-12-13), except Venice, the Papal States and, from
  1100, Genoa and Pisa; in the south Benevento, Salerno, Capua, Naples, Gaeta,
  Byzantium, the emirates of Sicily and Bari, then the Normans (Apulia 1042/1059,
  the County of Sicily 1061–91, the Kingdom of Sicily 1130). After 1250 the
  regional states are shown, with the cities not yet under a bigger neighbour
  grouped as `italian-communes`. After 1282 island Sicily and peninsular Naples
  are separate (the Two Sicilies from 1816). Naples, Sicily, Sardinia and Milan
  keep their own polities under Aragonese, Spanish or Austrian rule.
- **The Balkans and Hungary.** Bulgaria, Byzantium, the Franks and the Avars
  in 800; Great Moravia (833) and the Magyars (895–907); Samuel's Bulgaria and
  Basil II's conquest (1018). Croatia is its own kingdom in union with Hungary
  (1102–1527); the Second Bulgarian Empire (1185), Nemanjić Serbia, Bosnia
  (1180), Zeta and the Albanian principalities (1355) follow. The Latin states
  of 1204 are separate (Latin Empire, Thessalonica, Achaea, Athens, the
  Archipelago, Epirus). Ottoman vassals (Wallachia, Moldavia, Transylvania,
  Ragusa, Serbia from 1817, Bulgaria 1878–1908, Eastern Rumelia, the Cretan
  State) are shown as their own states. After Mohács (1526) the line between
  Habsburg Royal Hungary, Zápolya's kingdom (later Transylvania) and Ottoman
  Hungary moves with each fortress that fell; the Great Turkish War changes the
  map at Karlowitz (1699), the Balkan Wars at the treaties of 1913, and
  Kosovo is shown from its declaration of independence (2008-02-17). The
  Second World War is in the war files, except the Vienna Awards and the
  Treaty of Craiova. Fiume (Rijeka) is too small to be an atom; use a marker.
- **Anatolia and the Levant.** The Abbasid frontier (thughur) and the
  Byzantine reconquest (934–1045); Rum, the Danishmendids and the crusader
  states after 1081; the Ilkhanate (1243) and the Turkish beyliks
  (`anatolian-beyliks` groups the smaller emirates); the Eretnids, Karamanids,
  Kara Koyunlu and Aq Qoyunlu; the Ottomans, who stay on the base map until
  the sultanate is abolished (1922-11-01), after which all of Turkey is
  `turkey` (Hatay from 1939). The Allied, Greek, Italian and French zones of
  1918–1923 are war-step areas. In the Levant: the Tulunids, Ikhshidids,
  Hamdanids, Fatimids, the crusader states, the Zengids, Ayyubids and Mamluks;
  Ottoman from 1516–1517; Muhammad Ali's Egypt from 1805 (with Syria
  1833–1840); the mandates of 1920; the territories Israel occupied in 1967
  are war-step areas, and Palestine is shown from the 1988 declaration.
- **Rus' and the steppe.** Before the Rus' the forest peoples are shown as
  tribal groupings (`slavic-tribes`, `chuds`, `karelians`, `veps`, `volga-finns`,
  `mordvinians`, `permians`, `bashkirs`, `sami`), and the steppe passes from the
  Khazars to the Magyars (Etelköz, 830–895), the Pechenegs (895/969), the Oghuz
  east of the Volga and the Cumans (1061). Kievan Rus' grows from Novgorod (862)
  and Kiev (882) to the Vyatichi (965), Rostov and Murom (988) and Volhynia
  (993); Polotsk has its own princes from 1001, and the principalities of the
  break-up start in 1132.
- **The Caucasus.** Abbasid Arminiya in 800, then the emirates of Tbilisi
  (833), Shirvan (861) and Derbent (869), Bagratid Armenia (885) with Tashir
  (979), Syunik (987) and Khachen, the Sajids, Sallarids, Shaddadids
  (`arran`) and Rawwadids; Georgia united in 1008; the Seljuks, the
  Eldiguzids (1136), the Mongols and the Ilkhanate, the Chobanids, Jalayirids,
  Timurids, Kara Koyunlu and Aq Qoyunlu, then Safavid Persia (1501) and the
  Ottoman conquests of 1578–1607 and 1723–1735. Georgia splits in 1463–1465
  into Kartli (`georgia`), Kakheti, Imereti, Samtskhe, Mingrelia, Guria and
  Abkhazia. Vassal kingdoms stay on the map as their own states. The
  khanates (Karabakh, Ganja, Sheki, Shirvan, Baku, Quba, Derbent, Talysh,
  Javad, Erivan, Nakhchivan) are shown from Nader Shah's death (1747);
  Erivan and Nakhchivan are Persian again from 1795. North of the mountains:
  Alania, Circassia, Sarir and the Dagestani principalities (`dagestan`),
  Kabarda and the Chechen and Ingush communities (`vainakh`) after 1395.
- **The British Isles.** The Anglo-Saxon kingdoms and the Danelaw until England
  (927/954; Mercian client kingdoms are shown as Mercia); Wales until 1283, with
  the Marcher lordships under the English crown from 1070/1093; Pictland, Dál
  Riata and Strathclyde becoming Alba/Scotland; Viking Dublin; the Lordship of
  Ireland and the Irish lordships (Gaelicised Anglo-Norman lordships such as
  Desmond count as Irish) until the Tudor conquest (1556–1603); the
  Commonwealth union 1653/54–1660; Great Britain 1707; the United Kingdom 1801;
  the Irish Free State 1922.
- **Iran, Iraq, Afghanistan and Central Asia.** The Abbasids in 800, then the
  Tahirids (821), Saffarids (861), Samanids (873), Alids of Tabaristan,
  Ziyarids, Buyids (934–1062), Ghaznavids (962) and Karakhanids (999); the
  Seljuks (1038–1157), Khwarazmshahs, Ghurids and Qara Khitai; the Mongols
  (1220), the Ilkhanate (1256) and the Chagatai Khanate (1260); the break-up
  of 1338 (Jalayirids, Chobanids, Injuids, Muzaffarids, Kartids, Sarbadars);
  Timur (1370–1405), the Kara and Aq Qoyunlu; then Safavid `persia` (1501),
  the Shaybanids (`bukhara`, 1500), Khiva (1511), Babur and the Mughals in
  Kabul (1504) and Kandahar, the Ottomans in Iraq (1534), the Hotaki (1709),
  Nader Shah, the Durrani Empire (`afghanistan`, 1747), Kokand, the Qajars
  (1779/1794) and the Russian conquest (1862–1895). Tribal lands with no state
  (Ghor before the Ghurids, the Turkmen steppe 1599–1881, Kyrgyz lands after
  1570 and 1758) use `none`.
- **Arabia.** Abbasid governors in the Hejaz, Yemen and Bahrayn in 800; Najd,
  Asir, Dhofar and Hadramawt are `none` until a state takes them. The
  Qarmatians (899) and their successors in eastern Arabia (`hasa`), the Yemeni
  dynasties (Ziyadids, Yufirids, the Zaydi imams, Sulayhids, Rasulids,
  Tahirids), the Sharifate of Mecca (`hejaz`, 967), Oman and Hormuz (the
  Omani coast 1320–1622), the Portuguese, the Ottomans (1517–1918), the Saudi
  states (`saudi-arabia`, 1744/1824/1902), the Rashidis, the Trucial States
  (1820) and Aden (1839). The eastern-Arabian dynasties hold the Eastern
  Province atom, which also covers the Empty Quarter: read it as the coast.
- **South Asia.** In 800 the Pratiharas, Palas and Rashtrakutas contend for
  the north, the Pallavas, Pandyas and Chera Perumals share the south, the
  Abbasids hold Sind and the Hindu Shahis (`kabul-shahis`) Gandhara. Then the
  Cholas (848–1258), the Western Chalukyas (973), the Rajput kingdoms, the
  Ghaznavids and Ghurids, the Delhi Sultanate (1206), the regional sultanates
  and Vijayanagara (1336), the Mughals (1526), the Deccan sultanates, the
  Marathas (1674; Scindia and Holkar as `gwalior-state` and `indore-state` from
  1761), the successor states of the 1700s, and the East India Company
  (`british-india`, Crown rule from 1858). Princely states that kept their
  dynasty to 1947 (Mewar, Marwar, Jaipur, Bikaner, Jaisalmer, Bundi, Cutch,
  Kathiawar, Orchha, Rewa, Bhopal, Hyderabad, Mysore, Travancore, Cochin,
  Bahawalpur, Kalat, Jammu and Kashmir) stay coloured as such; smaller ones fall
  inside the British atoms. Groupings without one capital are `hill-states`
  (Nepal), `punjab-hill-states` (western Himalaya), `kathiawar`, `gonds` and
  `sikh-misls`. Hill and forest peoples of the north-east, the Kirat hills, the
  Thar and Kutch are `none` until a state takes them. Sri Lanka: Anuradhapura
  and its successors (`sinhala`, from 1412 Kotte), Jaffna, Kandy (1469), the
  Portuguese, the Dutch (1656/58) and the British (1795/1815). Remainders of
  split provinces are written with `!` (`IN-MP!` is Gondwana, `IN-UP!` Awadh,
  `IN-MH!` Desh, `IN-KA!` Mysore, `IN-KL!` Travancore, `IN-RJ!` Dhundhar).
- **East Asia and Siberia.** In 800 Tang China has lost the north-west to the
  Tibetan Empire; the Uyghur Khaganate rules Mongolia, Balhae Manchuria and
  Nanzhao (`dali`) Yunnan. Then the Five Dynasties (one id, `five-dynasties`,
  with the dynasty names as earlier names) and Ten Kingdoms, the Song (`song`,
  Southern Song from 1127), the Liao, Western Xia and Jurchen Jin, the Mongols
  (`mongol-empire` until Ariq Böke surrenders in 1264, then `yuan`), the Ming,
  the Northern Yuan, Oirats, Khalkha and Dzungars, the Qing (`qing`, Later Jin
  until 1636), the Republic (`roc`, which keeps Taiwan after 1949) and the
  People’s Republic (`china`). Tibet is one id throughout (`tibet`, labelled as
  under the Yuan and as a Qing protectorate); Amdo and Kham fall to
  `tibetan-chiefdoms` between empires. The Tarim has Qocho, Khotan, the
  Karakhanids, Qara Khitai, the Chagatayids, Moghulistan, Yarkent, Turfan,
  Yettishar (1865–1877) and Russia in Ili (1871–1882). Taiwan: `formosan-peoples`,
  Dutch Formosa, the Spanish north, Tungning, the Qing (west 1683, Yilan 1812,
  mountains and east 1875), Japan and the ROC. Leased territories (Hong Kong in
  three steps, Macau, Kwantung, Kiautschou, Weihaiwei, Guangzhouwan) have their
  own splits. Siberia goes to Russia fort by fort (1586–1778) from
  `finno-ugric-taiga-hunter-gatherers` and `siberian-peoples`; the Amur and
  Primorye in 1858 and 1860. Puppet states on the base map: Manchukuo,
  Mengjiang, the Far Eastern Republic, Tuva. Remainders: `CN-HE!` is southern
  Hebei, `CN-SX!` central Shanxi, `CN-SN!` Guanzhong, `CN-GS!` Lanzhou and
  Gannan, `CN-NM!` central Inner Mongolia, `CN-LN!` Liaodong, `CN-JS!` and
  `CN-AH!` the land south of the Yangtze, `CN-FJ!` north-western Fujian,
  `CN-SC!` the Sichuan basin, `CN-XJ!` the northern Tarim, `CN-XZ!` Ü-Tsang,
  `CN-QH!` Qinghai without Xining, `RU-KHA!` the Okhotsk coast.
- **Korea and Japan** (`korea-japan.yaml`). Korea: `silla`, Later Baekje
  and Taebong (892–936), `goryeo`, `joseon` (the Korean Empire from 1897),
  `tamna` (Jeju, until 1105), with Balhae, the Jurchens, the Jin, Eastern Xia
  and the Mongols in the north until Goryeo and Joseon reach the Yalu and the
  Tumen (1369–1449), and the lands the Mongols ruled directly (Ssangseong
  1258–1356, Dongnyeong 1270–1290, Jeju 1273–1294). After 1945 the American
  and Soviet military governments (`usamgik`, `soviet-civil-administration`),
  then `south-korea` and `north-korea`; the front lines of the Korean War are
  areas, and the base map changes at the armistice (`KR-41~n38`, `KR-42~n38`,
  `KP-05~s38`, `KP-06~s38`). Japan is one polity throughout (`japan`; rival
  courts, daimyo and rebels are areas), with `emishi` in the north of Tōhoku
  until 802 and about 1100, `ainu` in Hokkaido (Matsumae from 1604, the rest
  from 1799), southern Sakhalin and the Kurils, `sanzan` and `ryukyu` in the
  Ryukyu Islands until 1879, and `uscar` there in 1946–1972. Russia takes the
  northern Kurils in 1711 and northern Sakhalin in 1853; then the treaties of
  1855, 1875 and 1905 and the Soviet annexation of 1946 (`RU-SAK~karafuto`, `RU-SAK~skurils`, `RU-SAK~nkurils`; `RU-SAK!` is
  northern Sakhalin). Remainders: `JP-01!` is Hokkaido without the Matsumae
  tip, `JP-47!` Okinawa Island, `KP-08!` South Hamgyong north of Yonghung
  (`KP-08~yonghung`, the old Hwaju).
- **Southeast Asia** (`southeast-asia.yaml`). Burma: `pyu` and `ramanya`
  (the Mon), `pagan` (849, Lower Burma 1057), and after 1287 `pinya`
  (Myinsaing until 1313), `sagaing`, `ava` (1364), `hanthawaddy` (the Mon
  kingdom of Lower Burma, again 1740–1757), `prome` (1482–1542), `toungoo`
  (1510–1752), `konbaung` (1752), `shan-states` and `karenni`; `arakan`
  until 1785. British Burma comes in three steps (1826, 1852, 1886) as
  `british-india`, then `british-burma` (1937) and `myanmar` (1948).
  Thailand: `dvaravati`, `haripunchai`, `lavo`, `sukhothai`, `lan-na`
  (Burmese 1558–1596, 1614–1727 and 1763–1775, a Siamese vassal until 1899),
  `ayutthaya` (1351–1767), `tambralinga`, `pattani` (until 1902), then
  `thailand` (Thonburi from 1767). Laos: `lan-xang` (1353–1707),
  `luang-prabang`, `vientiane` (until 1828), `champasak` (1713) and
  `muang-phuan`, then `laos` (1946). Cambodia is `cambodia` throughout
  (named Chenla and the Khmer Empire), with the north-west Siamese in
  1795–1907 and Melou Prey in 1814–1904. Vietnam: `tang`, `jinghai` (905),
  `dai-viet` (939; Ming Jiaozhi 1407–1427), `mac` (1527–1592, Cao Bằng until
  1677), `nguyen` (the Nguyễn lords from about 1600, the empire from 1802),
  `tay-son` (1773–1802) and `champa`, which loses land in 1069, 1306, 1402,
  1471, 1611, 1653 and 1832; the Mekong delta passes from Cambodia in
  1698–1757; the Central Highlands are `none` until the French claim of 1893.
  `french-indochina` is Cochinchina (1862, 1867), the Lao left bank (1893),
  Tonkin (1897) and the Highlands, and Annam as well once the Nguyễn monarchy
  ends in 1945 (the Viet Minh zones are areas). `south-vietnam` (the State of
  Vietnam) has the whole country from 1949, `north-vietnam` the north from
  the Geneva line of 1954 (Quảng Bình north, Quảng Trị south); then
  `republic-of-south-vietnam` (1975–1976) and `vietnam`. Malay world:
  `srivijaya-empire`, `melayu`, `kedah`, `malacca` (about 1400–1511),
  `johor`, `perak`, `pahang`, `selangor`, `negeri-sembilan`,
  `terengganu`, `kelantan` and `perlis`; Portuguese, Dutch and British
  Malacca, Penang (1786) and Singapore (1824), `straits-settlements` (1826),
  `federated-malay-states` (1895), `malayan-union` (1946), `malaysia`
  (Federation of Malaya 1948, Malaysia 1963) and `singapore`. Borneo:
  `brunei`, Brooke `sarawak` in five steps (1841–1890), `north-borneo`
  (1881) and Labuan. Indonesia: Sumatra (`pagaruyung`, `pasai`, `aceh`,
  `aru`, `deli`, `siak`, `jambi`, `palembang`), Java (`medang`,
  `sunda`, `kediri`, `singhasari`, `majapahit`, `demak`, `pajang`,
  `surabaya`, `mataram-sultanate`, `yogyakarta` and `surakarta` from 1755,
  `banten`, `cirebon`, `blambangan`), `bali`, `bima`, `tanjungpura`,
  `pontianak`, `banjar`, `kutai`, `gowa`, `bone`, `luwu`, `buton`,
  `ternate`, `tidore`, `riau-lingga`, `timorese-kingdoms` and
  `papuan-peoples`. The VOC and the Dutch East Indies (`dutch-east-indies`)
  take the islands piece by piece from 1605 to 1911, with British Java in
  1811–1816; `indonesia` from 1949-12-27, `netherlands-new-guinea` and
  `untea` (1962–1963). Timor: `portuguese-timor` (1702), Indonesia
  (1976–1999), `untaet`, `timor-leste` (2002). Philippines:
  `barangay-polities`, `sulu` (until 1904), `maguindanao` (until 1861),
  `lanao` (until 1895), `spanish-east-indies` (1565–1899), the United States
  and `philippines` (1946). Remainders: `MM-02!` is Pegu and Tharrawaddy,
  `MM-03!` Magway north of Thayet, `MM-05!` Mergui and Tenasserim, `MM-13!`
  and `MM-15!` the land east of the Salween, `MM-17!` the Shan plateau west
  of the Salween, `MY-12!` Sabah without its west coast, `MY-13!` the Batang
  Lupar and Saribas, `ID-AC!` Aceh without Pasai, `ID-JB!` West Java without
  Cirebon, `ID-JT!` the north coast of Central Java, `ID-JI!` the Brantas
  valley and Surabaya, `ID-BA!` southern Bali, `ID-NB!` Lombok, `ID-NT!` the
  islands of East Nusa Tenggara without West Timor, `ID-SN!` Gowa and the
  west coast, `ID-MU!` Ternate and western Halmahera. Philippine cities and
  Vientiane Province have their own atoms (`PHL-…`, `LAO-3284`).
- **North Africa, the Sahel and the Horn** (`north-africa-horn.yaml`).
  Maghreb: `idrisids` (to 974), `nekor`, `barghawata`, `midrarids`,
  `rustamids` (to 909), `aghlabids` (to 909), the `fatimid` west (909–972),
  `zirids` (972–1148), `hammadids` (1015–1152), `zenata` emirs, then
  `almoravid-dynasty` (1054–1147) and `almohad-caliphate` (1140–1269);
  `hafsids` (1229–1574), `zayyanids` (1236–1554) and `marinids`
  (1244–1472), `wattasids` (1472–1554), with `hintata` in Marrakesh (1472–1525), and `morocco` (the Saadian
  Sultanate from 1510, the Alaouites from 1659). The Ottoman west is
  `algiers-regency` (1516–1830; Constantine until 1837), `tunisia` (1574)
  and Tripoli as `ottoman`, except under the Karamanli (`libya`,
  1711–1835); the Fezzan is `banu-khattab` (about 918–1176) and `fezzan`
  (1550–1812). Castile takes Oran (1509) and Bougie (1510), which pass to
  `spain` in 1516 (Oran until 1708 and again 1732–1792, Bougie until 1555);
  Tripoli is `sicily` (1510–1530), as are the Norman coast (1135–1160) and
  Djerba (1284–1335); Portugal Tangier (1471–1661) and the Doukkala coast; England Tangier
  (1661–1684); the Knights Tripoli (1530–1551). `french-algeria` comes in
  steps from 1830 to 1934. Morocco keeps its polity under the French
  protectorate, with `spanish-morocco` (1912–1956), `tangier` (1925–1956),
  Ifni (Spain 1934–1969), `spanish-sahara` (the Río de Oro 1884, Tarfaya and
  the Saguia el-Hamra 1912; Tarfaya to Morocco in 1958) and `western-sahara`
  (1976). `libya-it` (1912), then `british-military-administration` and
  `french-fezzan` (1947) and `libya` (Cyrenaica 1949, the kingdom 1951).
  Sahel: `ghana-empire`, `sosso` (about 1203), `mali-empire` (about
  1235–1670), `songhai` (Gao, the empire from 1464, Dendi after 1591),
  `pashalik-timbuktu` (1591), `kanem-bornu` (Bornu after 1380), `bulala`,
  `baguirmi` (1522), `wadai` (1635), `rabih` (1893–1900), `agadez`,
  `damagaram`, `mossi-states`, `liptako`, `bamana-empire` (1712), `kaarta`
  (1753), `massina` (1818), `toucouleur-empire` (1855), `kenedougou`,
  `trarza`, `brakna` and `adrar-emirate`; then `french-west-africa` (from
  1883) and `french-equatorial-africa` (from 1900), and independence in
  1960. Sudan: `makuria` (to about 1365), `alwa` (to about 1504), `funj`,
  `darfur` (about 1650–1874 and 1898–1916), `taqali`, `shilluk`, `egypt`
  (1820–1885, and Dongola and Berber again in 1896–1898), `mahdist-state`
  (1885–1898), `belgian-congo` in the Lado Enclave (1897–1910), `masalit`
  (1916–1922), `anglo-egyptian-sudan`,
  `sudan` (1956) and `south-sudan` (2011). The Horn: `aksum`, `zagwe`
  (about 1137), `ethiopia` (1270), `ifat`, `adal` (about 1415–1577),
  `aussa` (1577), `harar` (1647), `kaffa`, `shewa` (about 1682; Menelik's
  kingdom 1865–1889), the Oromo lands as `none` from the 1570s, `ajuran`,
  `geledi`, `isaaq`, `majeerteen` and `hobyo`; the Ottomans and Egypt on the
  coast; `italian-eritrea` (1882), `italian-somaliland` (1892; the trust
  territory 1950–1960), `british-somaliland` (1884), `french-somaliland`
  (1884), `italian-east-africa` (1936), British administration (1941–1952),
  `eritrea` (federated 1952, annexed 1962, independent from 1991),
  `somalia` (1960), `djibouti` (1977) and `somaliland` (1960 and 1991).
  Splits (`99d-north-africa-horn.geojson`): `MA-01~tangier`, `MA-03~rif`,
  `MA-04~nador` (Melilla's hinterland), `MA-06~tafilalet`, `MA-13~ifni`,
  `MA-14~tarfaya` and `MA-15~tarfaya` (the Tarfaya Strip, Draa to 27°40′ N),
  `MA-14~semara`, `ET-AM~shewa` (North Shewa), `ET-OR~shewa`,
  `ET-OR~hararghe`, `ET-OR~borena`, `ET-SN~kaffa` and `ET-AF~south` (Aussa).
  Natural Earth's Eritrean codes are mixed up: `ER-DU` is Northern Red Sea
  (Massawa), `ER-AN` Maekel (Asmara), `ER-MA` Debub, `ER-SK` Anseba (Keren);
  the names in atoms.json are right.
- **Checking borders.** After a build, `node tools/owners-at.mjs <date>
  [polities…] [--atoms <regex>]` lists who owns what on a date, and
  `node tools/owner-history.mjs <regex> [from] [to]` lists every change to the
  matching atoms with its source. To look at an area, open
  `/?box=<x,y,w,h>#/year/<year>` (km in the authoring projection, `tools/projection.mjs`; `node tools/box.mjs <lon> <lat> <width-km>`
  prints the box).
- **Polities in the drafts.** historical-basemaps lumps some unions together
  (the Polish–Lithuanian union, Denmark–Norway around 1000). The site keeps the
  Crown of Poland and the Grand Duchy of Lithuania apart until 1795, and uses
  `denmark-norway` only for the union of 1523–1814 (and the Kalmar years).
  Correct drafts that say otherwise.
- **Flip-flops.** The build warns when an atom goes A → B → A within 60 years
  and a draft keyframe is involved, which usually means the draft disagrees
  with a curated event. Fix the keyframe or the event. If the change is real
  (the Duchy of Warsaw, 1807–1815), record it in `content/borders/reviewed.yaml`.
- **Atoms.** Ids are ISO 3166-2 codes where Natural Earth has them (`SE-M`,
  `PL-MA`), otherwise its adm1 codes. `content/borders/atoms.json` lists them
  all with names and coordinates. A split atom is `<parent>~<name>`, such as
  `DK-84~bornholm`. Splits named after a year are the land a state held then:
  `~fi1938` (Finnish Karelia and Petsamo, in `RU-LEN`, `RU-KR`, `RU-MUR`),
  `~ee1938` and `~lv1938` (Petseri, Narva-taga, Abrene), `~ro1938` (Budjak,
  with `~ro1938~1856` for the part Moldavia held 1856–1878), `~pl1930`,
  `~de1930`, `~sax1783`-style `~sax`, `~pr1815` (Saxon until 1815, Prussian
  from 1815), `~sud` (the Sudetenland), `~us1945` (the American zone in
  Baden-Württemberg), `AT-4~muhl` (the Mühlviertel, Upper Austria north of the
  Danube, Soviet 1945–1955) and `AT-7~osttirol` (East Tyrol, British 1945–1955;
  `97-austria.geojson`) and so on. The German splits are historical regions:
  `DE-BY~bav` Old Bavaria, `DE-BY~bav~opf` Upper Palatinate, `DE-SN~olaus` Upper
  Lusatia, `DE-NW~lb` the left bank of the Rhine, `DE-NW~mark`, `DE-HE~hk`
  Hesse-Kassel, `DE-BW~baden~vorder` the Breisgau, and so on (see atoms.json).
  In the west: `FR-62~calais` the Pale of Calais, `FR-59~flandre` Walloon and
  maritime Flanders (Lille, Douai, Dunkirk; the rest of `FR-59` is Hainaut and
  the Cambrésis), `FR-57~metz`, `FR-64~bearn`, `NL-ZE~vlaanderen` Zeelandic
  Flanders and `BE-WLG~eupen` Eupen-Malmedy. In the south: `ES-HU~jaca` Upper
  Aragon, `ES-L~pallars` Urgell and Pallars, `ES-NA~tudela` the Ribera of
  Navarre, `ES-PM~menorca`, `ES-BA~olivenza`, the Neapolitan parts of Lazio
  (`IT-LT~gaeta`, `IT-FR~sora`, `IT-RI~cittaducale`), `IT-AL~casale` Montferrat
  and `IT-PV~pavese` (Pavia; the rest of `IT-PV` is the Lomellina and the
  Oltrepò, Sardinian from 1713). On the Adriatic (`95-adriatic.geojson`):
  `HR-08~cres` (Cres and Lošinj) and `HR-19~lastovo`, Italian 1918–1947;
  `HR-08~krk` (Krk and Rab), `HR-13~it1941`, `HR-15~it1941`, `HR-17~it1941`
  and `HR-19~korcula`, the Italian annexations of 1941; `HR-14~baranja`, north
  of the Drava. In the east (`90-east.geojson`):
  `GR-H~euboea`, `GR-G~achaea` (Achaea and Elis), `GR-L~dodecanese`,
  `GR-A~thrace` (Western Thrace), `TR-34~asia` (the Asian side of Istanbul), `RU-DA~derbent` (Derbent and the
  southern coast of Dagestan),
  `TR-17~gelibolu` (the Gallipoli peninsula), `RS-16~sandzak` and
  `RS-18~sandzak` (the Serbian Sandžak), and `~hu1938` for the four parts of
  southern Slovakia Hungary held in 1938–1945. `HU-BA~habHun`, `HU-SO~ottH` and
  `HU-VE~ottH` (from Sweden at War's map) follow the Habsburg–Ottoman line in
  Transdanubia.
- **Splits.** `content/borders/splits/*.geojson`, applied in file-name order:
  polygons in lon/lat with `{id: "<atom>~<name>", from: "<atom>", name}`. The
  part of the atom inside the polygon becomes the new atom (it may cut an atom
  made by an earlier split). To cut along a historical-basemaps border, use
  `node tools/split-from-hb.mjs <file> <year> "<NAME>" <suffix> "<name>" <atoms…>`.
  For a hand-drawn line, pass a GeoJSON file of polygons (each with a `NAME`)
  instead of the year; the tool folds slivers the same way. The 1783
  snapshot is unreliable in western Germany (its Prussia, Baden and a second
  "Bavaria" are later shapes); check a snapshot's polygon sizes first.
  Run `npm run geo` and `npm run draft` after adding splits (needs
  `npm run fetch-data` once); the draft gives a split atom its own owner only
  where it differs from its parent's.

## Adding a world region

Every province of the world is already on the map, with owners drafted from
historical-basemaps. A region gets its own history in this order:

1. **Polities.** Put the region's states in `content/polities/<region>.yaml`
   with `aliases` for the historical-basemaps names they replace (the build
   then redirects the automatic polities to them; check with
   `node tools/owner-history.mjs '^<ISO>-'`). Then
   `node tools/palette.mjs <region>.yaml` (after a build) gives them colours
   that stand apart from their neighbours.
2. **Borders.** Correct the drafts with `tools/set-owner.mjs`, put dated
   changes in `content/borders/events/<region>.yaml`, and, once the region's
   borders are all events, add a range to `content/borders/curated.yaml` and
   the table above. Add splits where history needs lines that modern provinces
   do not have.
3. **Capitals and labels** in `content/capitals.yaml` and `content/labels.yaml`.
4. **Wars**, one file each, as above. `countries` uses ISO 3166 codes; the
   country filter groups them by world region (the UN M49 regions, from
   `content/borders/countries.json`, which `npm run geo` writes).
5. **Translations** of names, summaries and step titles into French and
   Swedish (step bodies may follow later), then `npm run build` and `npm test`.

## Labels: `content/labels.yaml`

Geographic labels give readers physical and regional landmarks. The renderer places polity names automatically.

```yaml
labels:
  - text: Scania
    lonlat: [13.6, 55.9]
    class: lbl-reg          # lbl-reg or lbl-sea, plus lbl-dim (fainter) or lbl-small
    min_zoom: 1.6           # only when zoomed in this far (1 ≈ the Sweden at War map scale)
    from: "1658"            # optional date range
    until: "1720"
```

## Capitals and geographic references

`content/capitals.yaml` records the polity, period name, longitude and latitude,
and source for each seat. Optional `from` and `until` use the map’s date
precision. The start is inclusive and the end exclusive. A record applies only
while the polity holds mapped territory on the story or explorer date. For a
city-state too small to have a border atom, supply `point_only: true` and an
explicit founding date. Use the same coordinates for a shared city or a rename.

Give a temporary or concurrent seat a descriptive `role`. Use `Itinerant court`, `No permanent capital`, or `Territorial grouping`
for a sourced period without a single seat. Omit the name and coordinates
for those periods. For a documented city with a disputed location, keep its
name and source, omit the coordinates, and use `Unlocated seat`.
Each build emits `dist/data/capital-coverage.json`, with one entry per mapped
owner and period. It identifies unresolved periods.
The browser loads only the compiled located records and dated changes.

Physical references live in `content/labels.yaml`. Set `min_zoom` to the first
scale where the feature helps orientation. For a river, set `river` to its
name in the topology and provide a nearby coordinate. The build places its
label at the nearest vertex of the named river.

## Translations

English is the source language for historical data. The interface catalogs live
in `site/locales/`. To add a language, register its BCP 47 tag, native display
name, text direction and catalog in `site/locales/index.js`. Copy the English
message keys and keep placeholders such as `{year}` intact. For plural messages,
provide every category returned by `Intl.PluralRules` for that locale and use
`{count}` for the formatted number. Templates with named links accept those
placeholders in any order. Catalog messages are plain text.

Historical translations live in `content/locales/<tag>/`. The optional
`map.yaml` maps English source text to translated text under `polities`
(including dated names), `labels`, `capitals`, `capitalRoles` and
`borderSources`. Each optional `wars/<war-id>.yaml` maps source text to its
translation within one war. This covers the name, summary, notes, source titles,
side names and legend text, step titles, display dates, prose, facts, link
labels, markers, arrows and areas. The build uses the same translations in both
the catalogue and the story. Keep YAML keys identical to the parsed source text
and quote strings that YAML would otherwise interpret. An edited English key
must be updated or removed in its translations.

For example, in `content/locales/sv/wars/first-bremen-war.yaml`:

```yaml
First Bremen War: Första bremiska kriget
'Bremen, and a new king': Bremen och en ny kung
```

Omitted historical translations fall back to the English source. ISO display
dates and country names are formatted by the browser. Translate prose dates
and date ranges as ordinary strings. URLs, route IDs, chronological keys and
map geometry come from the source data. Run `npm run build` to validate the
catalogs and compile the translation files.

Some French historical entries were generated locally with
[Argos Translate](https://github.com/argosopentech/argos-translate) and its
English-to-French model. Review the French entries against the English sources
when correcting names, dates or wording.
