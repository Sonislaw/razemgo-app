const clean = (value, limit) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
  : '';

export function compactCampgrounds(source) {
  if (!source || source.remark || !Array.isArray(source.elements) ||
      !Number.isFinite(Date.parse(source.osm3s?.timestamp_osm_base)))
    throw Error('Incomplete OSM campground response');
  const rows = new Map();
  for (const item of source.elements) {
    const tags = item.tags ?? {};
    if (!['camp_site', 'caravan_site'].includes(tags.tourism) ||
        ['private', 'no'].includes(tags.access) || tags.disused === 'yes' || tags.abandoned === 'yes') continue;
    const name = clean(tags['name:pl'] || tags.name, 120);
    if (!name) continue;
    if (!['node', 'way', 'relation'].includes(item.type) || !Number.isSafeInteger(item.id) || item.id <= 0)
      throw Error('Invalid OSM campground identifier');
    const latitude = item.lat ?? item.center?.lat;
    const longitude = item.lon ?? item.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude < -85 || latitude > 85 || longitude < -180 || longitude > 180)
      throw Error('Invalid OSM campground coordinates');
    const locality = clean(tags['addr:city'] || tags['addr:village'] || tags['addr:hamlet'], 100);
    const street = clean(tags['addr:street'] || tags['addr:place'], 150);
    const number = clean(tags['addr:housenumber'], 30);
    const postcode = clean(tags['addr:postcode'], 20);
    const line = [street || (number ? locality : ''), number].filter(Boolean).join(' ');
    // A locality or a postcode alone is context, not a street address.
    const address = clean(tags['addr:full'], 200) || (line
      ? clean([line, [postcode, locality].filter(Boolean).join(' ')].filter(Boolean).join(', '), 200)
      : '');
    const id = item.type + ':' + item.id;
    if (rows.has(id)) throw Error('Duplicate OSM campground: ' + id);
    rows.set(id, [id, name, address, locality,
      Math.round(latitude * 1e6) / 1e6, Math.round(longitude * 1e6) / 1e6]);
  }
  return [...rows.values()].sort((a, b) => a[0].localeCompare(b[0], 'en'));
}
