/* The page around the screen: Demo / Info tabs, the LCD / CRT switch, the
 * panel or phosphor buttons, and the card's title, subtitle and icon.
 * It shows choices and reports them; main.js decides what they do. */

import {FAMILIES, screensIn} from './screens.js';


/**
 * @param {Object<string, HTMLElement>} el
 * @param {{onScreen:(id:string)=>void, onFamily:(family:string)=>void, onTab:(info:boolean)=>void}} on
 */
export function createView(el, on) {

 // ---- Demo / Info --------------------------------------------------------------

 for (const [tab, info] of [[el.tabDemo, false], [el.tabInfo, true]]) {
  tab.addEventListener('click', () => {
   el.tabDemo.setAttribute('aria-selected', String(!info));
   el.tabInfo.setAttribute('aria-selected', String(info));
   el.demoView.hidden = info;
   el.infoView.hidden = !info;
   on.onTab(info);
  });
 }


 // ---- LCD / CRT --------------------------------------------------------------

 for (const button of el.familyButtons) button.addEventListener('click', () => on.onFamily(button.dataset.family));


 // ---- The chosen screen --------------------------------------------------------

 function show(screen) {
  const family = FAMILIES[screen.family];
  document.body.className = screen.family;
  for (const button of el.familyButtons) button.setAttribute('aria-pressed', String(button.dataset.family === screen.family));

  el.title.textContent = family.title;
  el.subtitle.replaceChildren(...screen.sub.flatMap((line, i) => i ? [document.createElement('br'), line] : [line]));
  // SVG elements have no .hidden property: toggle the attribute.
  el.iconLcd.toggleAttribute('hidden', screen.family !== 'lcd');
  el.iconCrt.toggleAttribute('hidden', screen.family !== 'crt');

  el.profileLabel.textContent = family.picker;
  el.profiles.replaceChildren(...screensIn(screen.family).map(other => {
   const button = Object.assign(document.createElement('button'), {type: 'button', textContent: other.short, title: other.label});
   button.setAttribute('aria-pressed', String(other.id === screen.id));
   button.addEventListener('click', () => on.onScreen(other.id));
   return button;
  }));
 }

 return Object.freeze({show});
}
