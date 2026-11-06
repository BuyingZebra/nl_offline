/* NOMAD Tetris: deterministic, device-independent layout geometry.
 * All positions use CSS pixels; rendering DPR is handled separately.
 * Keep this module side-effect-free so viewport cases can be tested in Node.
 */
(function(root){
'use strict';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function computeLayout(W,H,safe,ui){
  W=Math.max(1,Number(W)||1);H=Math.max(1,Number(H)||1);
  const edges={
    top:clamp(Number(safe?.top)||0,0,H*.45),
    bottom:clamp(Number(safe?.bottom)||0,0,H*.45),
    left:clamp(Number(safe?.left)||0,0,W*.45),
    right:clamp(Number(safe?.right)||0,0,W*.45)
  };
  const usableW=Math.max(1,W-edges.left-edges.right);
  const usableH=Math.max(1,H-edges.top-edges.bottom);
  const landscape=W>H&&H<=600;
  const width=landscape?usableW:Math.min(usableW,ui.appMax);
  const off=edges.left+(usableW-width)/2;
  const pad=ui.padX,inner=Math.max(0,width-2*pad);
  const short=H<=730,compact=H<=620,gap=ui.stackGap;
  const deckPad=ui.deckPad,deckGap=ui.deckGap;
  const buttonH=compact?42:short?45:ui.padHeight;
  const headerButtonH=landscape?37:short?42:ui.headIcons;
  const extraH=headerButtonH;
  const overlaySecondaryH=compact?39:short?40:ui.extrasHeight;
  const headerH=compact?50:short?58:ui.headHeight;
  let hy=edges.top+(compact?4:short?9:0),hh=headerH;
  // V109: statistics move beside the board. Remove their 45px deck row
  // without moving any existing portrait button hitboxes.
  const legacyStatsOffset=ui.scoreHeight+deckGap;
  const dhDefault=2*deckPad+deckGap+buttonH+extraH;
  const bottomMargin=H>=550?ui.deckBottom:Math.max(ui.unit,Math.min(ui.deckBottom,usableH*.055));
  let dh=dhDefault,dy=H-edges.bottom-bottomMargin-dh;
  let sy=hy+hh+gap,sh=Math.max(0,dy-gap-sy);
  let hx=off+pad,hw=inner,sx=off+pad,sw=inner,dx=off+pad,dw=inner;
  if(landscape){
    let left=clamp(width*.24,100,205);
    let right=clamp(width*.30,166,260);
    const shortage=Math.max(0,124-(width-left-right-36));
    if(shortage){
      left=Math.max(88,left-shortage*.4);
      right=Math.max(150,right-shortage*.6);
    }
    hy=edges.top+8;hh=Math.min(64,Math.max(42,usableH-16));
    dy=edges.top+8+legacyStatsOffset;
    dh=Math.max(0,usableH-16-legacyStatsOffset);
    sy=edges.top+8;sh=Math.max(0,usableH-16);
    hx=off+8;hw=Math.max(0,left);
    sx=off+left+14;sw=Math.max(0,width-left-right-36);
    dx=off+width-right-8;dw=Math.max(0,right);
  }
  const sideGap=Math.min(ui.sideGap,Math.max(0,sw*.025));
  const sideWidth=Math.min(ui.side,Math.max(0,sw*.36));
  const bw=Math.max(0,Math.min(305,sw-sideWidth-sideGap,sh/2));
  const bh=bw*2;
  const bx=sx+Math.max(0,(sw-bw-sideGap-sideWidth)/2);
  const by=sy+Math.max(0,(sh-bh)/2);
  const sxSide=bx+bw+sideGap;
  const swSide=Math.max(0,Math.min(sideWidth,sx+sw-sxSide));
  // Original-inspired hierarchy: NEXT above stacked SCORE/LEVEL/LINES,
  // and the optional HOLD feature quietly at the bottom. Reuse the existing
  // column bounds, board ratio and device-dependent response.
  const nextTarget=Math.min(short?115:145,Math.max(44,bh*.28));
  const statsTarget=Math.min(short?170:205,Math.max(75,bh*.42));
  const holdTarget=Math.min(short?83:110,Math.max(44,bh*.23));
  const available=Math.max(0,bh-2*ui.unit);
  const total=nextTarget+statsTarget+holdTarget;
  const fit=total>0?Math.min(1,available/total):0;
  const nextH=nextTarget*fit,statsH=statsTarget*fit,holdH=holdTarget*fit;
  const nextPanel={x:sxSide,y:by,w:swSide,h:nextH};
  const statsPanel={x:sxSide,y:by+nextH+ui.unit,w:swSide,h:statsH};
  const holdPanel={x:sxSide,y:by+bh-holdH,w:swSide,h:holdH};
  const compactControls=landscape&&(dw-2*deckPad)<250;
  return {safe:edges,landscape,short,compact,compactControls,width,off,pad,inner,gap,
    hy,hh,hx,hw,sy,sh,sx,sw,boardX:bx,boardY:by,boardW:bw,boardH:bh,
    sideX:sxSide,sideW:swSide,holdPanel,nextPanel,statsPanel,dx,dy,dw,dh,
    deckPad,deckGap,buttonH,headerButtonH,extraH,overlaySecondaryH,
    footerY:H-edges.bottom-18};
}
const api=Object.freeze({computeLayout});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FieldAtlasTetrisLayout=api;
})(typeof window!=='undefined'?window:globalThis);
