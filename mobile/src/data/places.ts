// Approximate community-centre viewpoints for panning the map, NOT address geocoding
// and NOT navigable destination coordinates. [longitude, latitude].
export type Place = { name: string; label: string; coordinate: [number, number]; zoom: number };
export const places: Place[] = [
  { name: 'Carbonear', label: 'Conception Bay North', coordinate: [-53.2270, 47.7350], zoom: 14.2 },
  { name: 'Harbour Grace', label: 'Conception Bay North', coordinate: [-53.2110, 47.6925], zoom: 13.8 },
  { name: 'Bay Roberts', label: 'Conception Bay North', coordinate: [-53.2620, 47.5980], zoom: 13.8 },
  { name: "Spaniard's Bay", label: 'Conception Bay North', coordinate: [-53.2820, 47.6180], zoom: 13.5 },
  { name: 'Heart’s Content', label: 'Trinity Bay', coordinate: [-53.3680, 47.8670], zoom: 13.8 },
  { name: "St. John's", label: 'Avalon Peninsula', coordinate: [-52.7130, 47.5620], zoom: 12.8 },
];
export function searchPlaces(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return places;
  return places.filter(p => p.name.toLocaleLowerCase().includes(needle));
}
