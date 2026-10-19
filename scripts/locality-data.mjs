export const LOCALITY_COMMIT = 'f10df1ef9c5d6602787fdf9f409771859463cad5';
export const LOCALITY_AS_OF = '2021-05-11';
export const LOCALITY_REPOSITORY =
  'https://github.com/jjbartek/polskie-miejscowosci';
const normalizeName = (value) =>
  value
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');

export function compactLocalities(rows) {
  if (!Array.isArray(rows) || !rows.length)
    throw new Error('Brak miejscowości w danych źródłowych.');
  const provinces = [],
    districts = [],
    communes = [];
  const provinceIds = new Map(),
    districtIds = new Map(),
    communeIds = new Map();
  const ids = new Set();
  const intern = (values, index, value) => {
    if (!index.has(value)) {
      index.set(value, values.length);
      values.push(value);
    }
    return index.get(value);
  };
  const places = rows.map((row, index) => {
    if (
      !row ||
      ['Id', 'Name', 'Province', 'District', 'Commune'].some(
        (key) => typeof row[key] !== 'string' || !row[key].trim(),
      ) ||
      !['city', 'village'].includes(row.Type) ||
      !Number.isFinite(row.Latitude) ||
      !Number.isFinite(row.Longitude)
    )
      throw new Error(`Nieprawidłowa miejscowość w wierszu ${index + 1}.`);
    if (ids.has(row.Id))
      throw new Error(`Powtórzony identyfikator miejscowości: ${row.Id}.`);
    ids.add(row.Id);
    return [
      row.Id,
      row.Name,
      row.Type === 'city' ? 1 : 0,
      intern(provinces, provinceIds, row.Province),
      intern(districts, districtIds, row.District),
      intern(communes, communeIds, row.Commune),
      row.Latitude,
      row.Longitude,
      normalizeName(row.Name),
    ];
  });
  const prefixes = {};
  for (const [index, row] of places.entries()) {
    const text = [
      row[8],
      normalizeName(provinces[row[3]]),
      normalizeName(districts[row[4]]),
      normalizeName(communes[row[5]].replace(/-gmina .+$/u, '')),
    ].join(' ');
    const keys = new Set(
      text
        .split(/[^a-z0-9]+/u)
        .filter((word) => word.length >= 2)
        .map((word) => word.slice(0, 2)),
    );
    for (const key of keys) (prefixes[key] ??= []).push(index);
  }
  return { provinces, districts, communes, places, prefixes };
}
