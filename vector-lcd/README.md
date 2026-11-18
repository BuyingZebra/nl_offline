# Vector LCD

A cell-free, physics-informed reflective LCD for vector art. It has no pixel grid and no cells. Electrodes are arbitrary shapes, as on a segment LCD, and all geometry is in millimetres, re-rasterized at the device's own resolution.

Open it at **https://buyingzebra.github.io/nl_offline/vector-lcd/** and use **Add to Home Screen** to install it. After the first visit it works offline.

## The model

The model simulates each point on the glass, not each cell:

drive voltage → electro-optic target → liquid-crystal response → ionic retention → reflective optics → reflector shadow

| Effect | Mechanism | Grounding |
| --- | --- | --- |
| Response and ghosting | Each point approaches its target darkness. Switching on takes `τ_on = τ_off / ((V/V_th)² − 1)`, which is faster under drive. Relaxing off takes `τ_off`, with no field to help. | The switching-time relation is standard liquid-crystal physics. `τ_off`, `V_th` and the transition width are chosen settings. |
| Ghost segments | Off electrodes still receive the multiplex bias voltage (1/3 of the operating voltage by default), so they show faintly. | Real for multiplexed segment drive. The bias ratio is a setting. |
| Crosstalk | Segment mode: off electrodes are lifted in proportion to how many electrodes on their shared drive line are on. Free-art zone: off points are lifted by the driven fraction of their row and column. | A simplified model of waveform-dependent RMS error. The amount is a setting. |
| Reflector shadow | The image layer sits above a mirror behind rear glass. The shadow is offset by `t · tan(asin(sin θ / n))`, with refraction index n = 1.5, and softened by light spread. | Geometric optics. Glass thickness, light angle and spread are settings. |
| Image retention | A slow charge follows the crystal state, charging while held and releasing after, and leaves a fading imprint. | A first-order stand-in for ionic image sticking. Time constants and strength are settings. |
| Soft edges | Fringe fields soften each electrode's edge (a Gaussian, in mm). | Qualitative. The width is a setting. |

Time steps use exact exponential solutions, including for the coupled crystal and retention layers, so results don't depend on frame rate. Colors are mixed in linear light.

**Honest limits.** No real panel has these electrodes, so this is not a measured reproduction of any device. The relationships are physical, but the parameter values are choices within plausible ranges. "Physics-informed" is accurate; "accurate to a real panel" would not be.

## Two kinds of content

- **Electrodes:** fixed shapes (`Path2D`, SVG path data, or art). These show ghost segments and line crosstalk. Use them for segment-style displays.
- **Free-art zone:** a rectangle where art can move anywhere. It behaves like an addressable matrix finer than the eye can resolve: the zone sits at the bias level, and moving art leaves response trails and row/column streaks.

## Using the engine

`vector-lcd.js` is a dependency-free ES module (WebGL2).

```js
import {createVectorLCD} from './vector-lcd.js';

const lcd = createVectorLCD(canvas, {widthMm: 64, heightMm: 100, params: {relaxMs: 220}});
lcd.resize(cssWidth, cssHeight, devicePixelRatio);

lcd.addElectrode({id: 'seg-a', line: 'A', path: 'M2 2H12V4H2Z'});
lcd.addElectrode({id: 'logo', line: 'L', art: {source: svgImage, x: 40, y: 30, w: 20, h: 20}});
lcd.setZone({x: 3, y: 60, w: 58, h: 37}, (ctx, timeS, tools) => {
  // ctx is in millimetres; tools.level(v) is the colour for drive v (0-1).
  ctx.drawImage(tools.art(svgImage, 16, 16), 10 + 20 * Math.sin(timeS), 70, 16, 16);
});

function tick(now) {
  lcd.setOn('seg-a', Math.floor(now / 500) % 2 === 0);
  lcd.frame(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Other methods: `setParams`, `params`, `resetState`, `removeElectrode`, `clearElectrodes`, `info`, `sample` (reads the simulated state at a point, for testing) and `dispose`. The pure model functions (`electroOptic`, `stepPixel`, `multiplexVoltages`, `shadowVectorMm` and others) are exported too. The GPU shaders mirror them, and the tests check they agree.

In art, dark areas are driven, light areas sit at the bias, and transparent areas have no electrode.

## Performance

The drive layer is drawn with Canvas2D and uploaded each frame. That upload is the main cost. The render size is capped at 2× device pixel ratio. The simulation state uses 32-bit float textures where available, then 16-bit float, then 8-bit. Slow retention loses precision in 8-bit; `info()` reports which format is in use.

## Releases

The version appears in four places, and a test checks they match: `ENGINE_VERSION` in `vector-lcd.js`, `APP_VERSION` in `demo.js`, the `vector-lcd-version` meta tag in `index.html`, and `VERSION` in `sw.js`. Bump all four together for every release; the service worker uses the version to cache a new copy. Run the tests with `node --test tests/vector-lcd.test.mjs`.
