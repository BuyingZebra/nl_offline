// Deliberately SMALL evaluation area. Offline downloads from OpenFreeMap
// are limited to 3,000 tiles or 50 MB per download (and 4 parallel requests).
// Bounds: [west, south, east, north] per MapLibre API.
export const CARBONEAR_BOUNDS: [number,number,number,number] = [-53.253, 47.717, -53.203, 47.751];
export const REGION_ID = 'carbonear-test-v1';
export const OFFLINE_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
export const DOWNLOAD_ZOOM = { minZoom: 10, maxZoom: 16 };
