/* FIELD ATLAS v0.31 experimental OSM Standard phosphor pipeline.
 * This processes only the tiles requested by an interactive map viewport.
 * Never use this to prefetch, scrape, or create offline OSM tile archives.
 * For offline releases: render OSM data independently (not OSMF tiles).
 */
(function () {
  'use strict';
  const protocol = 'fieldatlas';
  const tileOrigin = 'https://tile.openstreetmap.org/';
  let installed = false;

  const colors = {
    green: { bg: [7, 23, 15], ink: [181, 234, 196] },
    amber: { bg: [22, 13, 5], ink: [255, 224, 168] }
  };
  // Preserve the native pixel-to-pixel contrast of the OSM Standard image:
  // an invertible, continuous luma transfer, NOT thresholded segmentation.
  // White map paper/road interiors become the dark phosphor surface; its dark
  // road outlines and lettering become bright ink. No geometry is inferred,
  // traced, sharpened, blurred, or discarded by this colour conversion.
  function colorize(imageData, theme) {
    const p = colors[theme];
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const luminance = (r * .2126 + g * .7152 + b * .0722) / 255;
      const phosphor = Math.pow(1 - luminance, .68);
      d[i] = Math.round(p.bg[0] + phosphor * (p.ink[0] - p.bg[0]));
      d[i + 1] = Math.round(p.bg[1] + phosphor * (p.ink[1] - p.bg[1]));
      d[i + 2] = Math.round(p.bg[2] + phosphor * (p.ink[2] - p.bg[2]));
    }
    return imageData;
  }

  function install(maplibregl) {
    if (installed) return;
    if (!maplibregl || typeof maplibregl.addProtocol !== 'function') {
      throw new Error('MapLibre protocol API unavailable');
    }
    maplibregl.addProtocol(protocol, async (params, controller) => {
      const match = /^fieldatlas:\/\/(green|amber)\/([0-9]+)\/([0-9]+)\/([0-9]+)\.png$/.exec(params.url);
      if (!match) throw new Error('Unexpected FIELD ATLAS tile URL');
      if (typeof createImageBitmap !== 'function') {
        throw new Error('ImageBitmap support required for experimental phosphor tiles');
      }
      const [, theme, z, x, y] = match;
      // Explicitly fetch OSMF Standard tiles only for the visible map, and
      // use normal browser HTTP caching (do not force revalidation).
      const response = await fetch(tileOrigin + z + '/' + x + '/' + y + '.png', {
        signal: controller && controller.signal,
        cache: 'default'
      });
      if (!response.ok) throw new Error('OpenStreetMap tile HTTP ' + response.status);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Tile canvas unavailable');
        ctx.drawImage(bitmap, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        ctx.putImageData(colorize(pixels, theme), 0, 0);
        // Return a real encoded image buffer, as expected by MapLibre's
        // raster protocol API. Safari supports canvas.toBlob.
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(result => result ? resolve(result) : reject(new Error('Tile PNG encode failed')), 'image/png');
        });
        return { data: await blob.arrayBuffer() };
      } finally {
        if (typeof bitmap.close === 'function') bitmap.close();
      }
    });
    installed = true;
  }

  window.FieldAtlasPhosphor = Object.freeze({
    install,
    tileTemplate(theme) {
      if (!colors[theme]) throw new Error('Unknown FIELD ATLAS theme');
      return protocol + '://' + theme + '/{z}/{x}/{y}.png';
    }
  });
})();
