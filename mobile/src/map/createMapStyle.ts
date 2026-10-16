import { palettes, ThemeName } from '../design/themes/palette';

// FIELD ATLAS v0.2: cartographic detail without visual clutter.
// The same style layers can render locally generated Newfoundland vector tiles.
// The URLs below still point to ONLINE demo resources; production offline maps
// must supply local tiles, glyphs and other style resources.
export function createMapStyle(themeName: ThemeName) {
  const ui = palettes[themeName];
  const p = themeName === 'pipboy'
    ? {
      bg: '#07170f', land: '#0b2117', park: '#112d1e', water: '#0b2926',
      stream: '#245045', building: '#254233', path: '#254b35',
      local: '#34684c', tertiary: '#467d5d', secondary: '#599471',
      major: '#79b58e', casing: '#05120b', street: '#9ac3a7', town: '#b5eac4',
    }
    : {
      bg: '#10141e', land: '#151b27', park: '#1a2831', water: '#142c40',
      stream: '#284155', building: '#2d3544', path: '#303b4b',
      local: '#435065', tertiary: '#536178', secondary: '#697890',
      major: '#8797ad', casing: '#0b111a', street: '#abb7c7', town: '#d8e0ec',
    };

  const src = 'osm';
  const join = { 'line-join': 'round', 'line-cap': 'round' };
  const w = (a: number, b: number, c: number, d: number) =>
    ['interpolate', ['linear'], ['zoom'], 10, a, 14, b, 17, c, 19, d];
  const klass = (types: string[]) => ['match', ['get', 'class'], types, true, false];
  const name = ['coalesce', ['get', 'name:en'], ['get', 'name'], ''];
  const road = (id: string, types: string[], color: string, width: unknown, minzoom: number, extra = {}) => ({
    id, type: 'line' as const, source: src, 'source-layer': 'transportation',
    minzoom, filter: klass(types), layout: join,
    paint: { 'line-color': color, 'line-width': width, 'line-opacity': 0.92, ...extra },
  });

  return {
    version: 8 as const,
    name: `FIELD ATLAS / ${themeName} / cartography v0.2`,
    center: [-53.2270, 47.7350], zoom: 14,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [src]: { type: 'vector' as const, url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.bg } },
      { id: 'landcover', type: 'fill', source: src, 'source-layer': 'landcover',
        paint: { 'fill-color': p.land, 'fill-opacity': 0.30 } },
      { id: 'parks', type: 'fill', source: src, 'source-layer': 'landuse',
        filter: klass(['park','grass','wood','forest','nature_reserve']),
        paint: { 'fill-color': p.park, 'fill-opacity': 0.48 } },
      { id: 'water', type: 'fill', source: src, 'source-layer': 'water',
        paint: { 'fill-color': p.water } },
      { id: 'waterways', type: 'line', source: src, 'source-layer': 'waterway', minzoom: 11,
        layout: join, paint: { 'line-color': p.stream, 'line-opacity': 0.75,
          'line-width': w(0.35, 0.6, 1, 1.35) } },
      { id: 'buildings-fill', type: 'fill', source: src, 'source-layer': 'building', minzoom: 13.2,
        paint: { 'fill-color': p.building,
          'fill-opacity': ['interpolate',['linear'],['zoom'],13,0.36,16,0.62,19,0.75] } },
      road('paths', ['path','footway','cycleway','steps','pedestrian','bridleway'], p.path,
        w(0.25,0.48,0.75,1), 13, {'line-dasharray':[2,2]}),
      road('local-roads', ['minor','residential','living_street','service','unclassified','road','track'], p.local,
        w(0.35,1.0,1.7,2.45), 11.2),
      road('tertiary-roads', ['tertiary','tertiary_link'], p.tertiary,
        w(0.55,1.4,2.2,3.1), 10),
      road('major-casing', ['secondary','secondary_link','primary','primary_link','trunk','trunk_link','motorway','motorway_link'], p.casing,
        w(1.75,3.6,5.2,6.8), 7),
      road('secondary-roads', ['secondary','secondary_link'], p.secondary,
        w(1.1,2.1,3.1,4.1), 8),
      road('primary-roads', ['primary','primary_link','trunk','trunk_link','motorway','motorway_link'], p.major,
        w(1.45,2.65,3.9,5.1), 7),
      { id: 'street-names', type: 'symbol', source: src, 'source-layer': 'transportation_name', minzoom: 13,
        layout: { 'symbol-placement':'line', 'text-font':['Noto Sans Regular'],
          'text-field': name, 'text-size':['interpolate',['linear'],['zoom'],13,9.5,16,11.5,19,12.4],
          'text-padding':8, 'text-max-angle':35, 'text-allow-overlap':false, 'text-letter-spacing':0.015 },
        paint: { 'text-color':p.street, 'text-opacity':0.87,
          'text-halo-color':p.bg, 'text-halo-width':1.25, 'text-halo-blur':0.25 } },
      { id: 'settlements', type: 'symbol', source: src, 'source-layer': 'place', minzoom: 5,
        filter: klass(['city','town','village','hamlet','suburb','neighbourhood']),
        layout: { 'text-font':['Noto Sans Regular'], 'text-field':name,
          'text-size':['interpolate',['linear'],['zoom'],7,10.5,12,12.5,16,14.5],
          'text-padding':10, 'text-max-width':10, 'text-allow-overlap':false },
        paint: { 'text-color':p.town, 'text-opacity':0.92,
          'text-halo-color':p.bg, 'text-halo-width':1.75 } },
    ],
    metadata: { 'field-atlas': { routeColour: ui.route, scope: 'Newfoundland and Labrador' } },
  };
}
