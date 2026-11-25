/* The Info tab: what the screen is, and where every number comes from. */

import {kindOf} from './screens.js';


/** @param {Object<string, HTMLElement>} el  title, driveNote, figures, facts, status */
export function createInfo(el) {

 /** Fill the tab for a screen. */
 function show(screen, profile, renderer) {
  const def = kindOf(screen).definition;
  el.title.textContent = screen.label;
  el.driveNote.textContent = def.driveNote(profile);
  // Figures, where the screen has them: markup built from the profile's numbers (no outside content).
  el.figures.replaceChildren(...(def.figures?.(profile, renderer) ?? []).map(f => {
   const fig = document.createElement('figure');
   fig.className = 'fig';
   fig.append(Object.assign(document.createElement('h3'), {textContent: f.title}));
   const art = document.createElement('div');
   art.className = 'fig-art';
   art.innerHTML = f.svg;
   fig.append(art, Object.assign(document.createElement('figcaption'), {textContent: f.caption}));
   return fig;
  }));
  el.figures.hidden = !el.figures.children.length;
  el.facts.replaceChildren(...def.facts(profile, renderer).flatMap(([label, value]) => [
   Object.assign(document.createElement('dt'), {textContent: label}),
   Object.assign(document.createElement('dd'), {textContent: value})
  ]));
 }

 /** One line on the renderer: speed, size and formats. */
 function status(screen, renderer) {
  const i = renderer.info();
  el.status.textContent = i.fps + ' fps · ' + i.width + '×' + i.height + ' px · ' + i.pxPerMm.toFixed(1) + ' px/mm · '
   + i.stateFormat + ' state · ' + screen.kind + ' renderer ' + i.version;
 }

 return Object.freeze({show, status});
}
