# Content guide

How to add and edit wars, borders and polities. Everything lives in `content/`
as YAML or JSON. Run `npm run build` after editing: it validates everything
and tells you what is wrong and where.

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
| A | Full story, 5–20 steps |
| B | Short story, 1–3 steps |
| C | Catalogue entry only: dates, sides, one-paragraph `summary`, sources. Steps may be omitted or have no body. |

Write tier C entries for a region's wars first, then upgrade the important ones.

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
        via: [[13.8, 56.6], [13.5, 56.1], [13.2, 55.75]]   # smooth curve through points
        # or bezier: [p0, c1, c2, p1, c1, c2, p2, …]         # 1 + 3n points
        label_at: [13.9, 56.2]                              # optional label position
    areas:
      - style: occupied      # occupied gained pledged lost outline contested front
        side: dk             # colour and hatch come from the side's ink
        label: Occupied by Denmark–Norway                   # legend text
        atoms: [SE-M]        # atom ids (an id includes all its splits)
```

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

```yaml
- date: "1658-02-26"
  note: Treaty of Roskilde.
  owners:
    sweden: [SE-M, SE-K, SE-N, DK-84~bornholm]
    "-": [XX-1]          # "-" means: fall back to the drafted keyframes
```

- `content/borders/curated.yaml` lists date ranges in which keyframes are
  ignored for some atoms, so that hand-made borders (such as Sweden at War's,
  1240–1815) are not overridden by drafts.
- **Flip-flops.** The build warns when an atom goes A → B → A within 60 years
  and a draft keyframe is involved, which usually means the draft disagrees
  with a curated event. Fix the keyframe or the event. If the change is real
  (the Duchy of Warsaw, 1807–1815), record it in `content/borders/reviewed.yaml`.
- **Atoms.** Ids are ISO 3166-2 codes where Natural Earth has them (`SE-M`,
  `PL-MA`), otherwise its adm1 codes. `content/borders/atoms.json` lists them
  all with names and coordinates. A split atom is `<parent>~<name>`, such as
  `DK-84~bornholm`.
- **Splits.** `content/borders/splits/*.geojson`: polygons in lon/lat with
  `{id: "<atom>~<name>", from: "<atom>", name}`. The part of the atom inside the
  polygon becomes the new atom. Run `npm run geo` and `npm run draft` after
  adding one (needs `npm run fetch-data` once).

## Labels: `content/labels.yaml`

Seas, regions and capitals that are not polity names. Polity names are placed
automatically.

```yaml
labels:
  - text: Scania
    lonlat: [13.6, 55.9]
    class: lbl-reg          # lbl-reg or lbl-sea, plus lbl-dim (fainter) or lbl-small
    min_zoom: 1.6           # only when zoomed in this far (1 ≈ the Sweden at War map scale)
    from: "1658"            # optional date range
    until: "1720"
capitals:
  - name: Stockholm
    lonlat: [18.07, 59.33]
    lp: r                   # label position: r, l, t or b
    from: "1250"
```
