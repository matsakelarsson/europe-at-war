// The catalogue details and the border changes are split into files by date:
// one per century, and a century with a lot in it is cut at year boundaries
// into smaller files. A file is named by its first year ("1900", "1939"), and
// borders.json lists the names (B.buckets). The build (tools/build.mjs) and the
// site both use bucketOf to find the file a date is in.

/** The file a date key ("1648-12-31") is in: the last start year not after it. */
export function bucketOf(starts, key) {
  const year = (key || '0000').slice(0, 4);
  let lo = 0, hi = starts.length - 1, found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= year) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return starts[found];
}

/**
 * The start years for items sorted by date ({ year: "1914", size: bytes }):
 * one file per century, and a century whose items add up to more than
 * `limit` bytes (counting `overhead` per file) is cut at year boundaries into
 * parts of about equal size. Items of the same year stay in the same file.
 */
export function bucketStarts(items, limit, overhead = 0) {
  const centuries = new Map();
  for (const { year, size } of items) {
    const century = year.slice(0, 2) + '00';
    if (!centuries.has(century)) centuries.set(century, new Map());
    const years = centuries.get(century);
    years.set(year, (years.get(year) || 0) + size);
  }
  const starts = [];
  for (const [century, years] of centuries) {
    starts.push(century);
    const total = [...years.values()].reduce((a, b) => a + b, 0);
    const parts = Math.ceil(total / Math.max(1, limit - overhead));
    if (parts < 2) continue;
    const target = total / parts;
    let size = 0;
    for (const [year, n] of years) {
      // Start a new file when this year would take the current one more
      // than half its own size past the target.
      if (size && size + n / 2 > target) { starts.push(year); size = 0; }
      size += n;
    }
  }
  return starts;
}
