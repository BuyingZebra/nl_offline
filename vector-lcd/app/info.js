/* The Info tab: what the screen is, and where every number comes from. */

import {kindOf} from './screens.js';


/** @param {Object<string, HTMLElement>} el  title, driveNote, facts, status */
export function createInfo(el) {

 /** Fill the tab for a screen. */
 function show(screen, profile, renderer) {
  const def = kindOf(screen).definition;
  el.title.textContent = screen.label;
  el.driveNote.textContent = def.driveNote(profile);
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
