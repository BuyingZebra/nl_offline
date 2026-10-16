import { palettes, ThemeName } from '../design/themes/palette';

// Source layer names follow the OpenMapTiles schema used by OpenFreeMap.
// Both the custom style and the offline-pack style must fetch the SAME tile URLs.
// This style is intentionally local: the map design still loads when offline.
export function createMapStyle(themeName: ThemeName) {
  const p = palettes[themeName];
  const source = 'osm';
  const labelFont = ['Noto Sans Regular'];
  const textBase = {
    'text-font': labelFont,
    'text-allow-overlap': false,
    'text-padding': 2,
  };
  const halo = {
    'text-color': p.primary,
    'text-halo-color': p.bg,
    'text-halo-width': 1.6,
    'text-halo-blur': 0.5,
  };
  const lineBase = { 'line-cap': 'round', 'line-join': 'round' };
  const roadWidth = (thin: number, thick: number) => ['interpolate', ['linear'], ['zoom'], 8, thin, 16, thick];
  return {
    version: 8 as const,
    name: `Newfoundland Offline / ${themeName}`,
    center: [-53.2270, 47.7350], zoom: 14,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [source]: { type: 'vector' as const, url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.bg } },
      { id: 'landcover', type: 'fill', source, 'source-layer': 'landcover',
        paint: { 'fill-color': p.panel, 'fill-opacity': 0.52 } },
      { id: 'landuse', type: 'fill', source, 'source-layer': 'landuse',
        paint: { 'fill-color': p.panelAlt, 'fill-opacity': 0.28 } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water',
        paint: { 'fill-color': p.water } },
      { id: 'waterway', type: 'line', source, 'source-layer': 'waterway', minzoom: 9,
        layout: lineBase, paint: { 'line-color': p.primaryDim, 'line-opacity': 0.35, 'line-width': 0.85 } },
      { id: 'buildings-fill', type: 'fill', source, 'source-layer': 'building', minzoom: 13.25,
        paint: { 'fill-color': p.building, 'fill-opacity': 0.76,
          'fill-outline-color': p.primaryDim } },
      { id: 'roads-outline', type: 'line', source, 'source-layer': 'transportation', minzoom: 8,
        layout: lineBase, paint: { 'line-color': p.bg, 'line-width': roadWidth(2, 7) } },
      { id: 'roads', type: 'line', source, 'source-layer': 'transportation', minzoom: 8,
        layout: lineBase, paint: {
          'line-color': p.road, 'line-opacity': 0.93,
          'line-width': roadWidth(0.6, 3.0),
        } },
      { id: 'highways', type: 'line', source, 'source-layer': 'transportation', minzoom: 6,
        filter: ['match', ['get','class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false],
        layout: lineBase, paint: {
          'line-color': p.highway, 'line-opacity': 0.95,
          'line-width': roadWidth(1.25, 4.0),
        } },
      { id: 'street-names', type: 'symbol', source, 'source-layer': 'transportation_name', minzoom: 12,
        layout: { ...textBase, 'symbol-placement': 'line',
          'text-field': ['coalesce', ['get','name:en'], ['get','name'], ''],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 12],
          'text-letter-spacing': 0.055 },
        paint: halo },
      { id: 'settlements', type: 'symbol', source, 'source-layer': 'place', minzoom: 5,
        filter: ['match', ['get','class'], ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood'], true, false],
        layout: { ...textBase, 'text-field': ['coalesce', ['get', 'name:en'], ['get','name'], ''],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 14, 15],
          'text-max-width': 9, 'text-letter-spacing': 0.09 },
        paint: { ...halo, 'text-halo-width': 2.4 } },
    ],
  };
}
