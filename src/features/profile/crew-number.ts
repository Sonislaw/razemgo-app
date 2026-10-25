export function crewNumberText(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 100000 && value <= 2147483647 ? 'Ekipa #' + value : null;
}

export function matchesCrewSearch(name: string, crewNumber: number | undefined, query: string) {
  const text = query.trim();
  if (/^#?\s*[0-9]+$/.test(text)) {
    const digits = text.replace(/^#?\s*/, '').replace(/^0+/, '');
    return !!crewNumberText(crewNumber) && String(crewNumber) === digits;
  }
  if (text.startsWith('#')) return false;
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  return normalize(name).includes(normalize(text));
}
