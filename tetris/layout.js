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
  // Preserve the established portrait sizes on either side of each range.
  // Grow the header and deck together gradually, so their combined height
  // grows more slowly than the viewport and cannot take height from the board.
  const compactGrowth=clamp((H-604)/32,0,1);
  const regularGrowth=clamp((H-702)/56,0,1);
  const preferredButtonH=42+3*compactGrowth+(ui.padHeight-45)*regularGrowth;
  const preferredExtraH=42+(ui.headIcons-42)*regularGrowth;
  const buttonH=landscape?(compact?42:short?45:ui.padHeight):
    Math.max(44,preferredButtonH);
  const headerButtonH=landscape?37:preferredExtraH;
  const extraH=landscape?headerButtonH:Math.max(44,preferredExtraH);
  const overlaySecondaryH=landscape?(compact?39:short?40:ui.extrasHeight):
    39+compactGrowth+(ui.extrasHeight-40)*regularGrowth;
  let hy=edges.top+4+5*compactGrowth-9*regularGrowth;
  let hh=50+8*compactGrowth+(ui.headHeight-58)*regularGrowth;
  // V109 moved statistics to the sidebar, keeping portrait button hitboxes.
  // The recovered score-row space is reserved, not added to the game board.
  const legacyStatsOffset=ui.scoreHeight+deckGap;
  const dhDefault=2*deckPad+deckGap+buttonH+extraH;
  // Ease into the full bottom margin. The terminal needs 37 CSS pixels
  // plus its 1px deck gap, including room below the usable area if present.
  const preferredMargin=Math.min(ui.deckBottom,
    Math.max(ui.unit,usableH*.055,ui.deckBottom+(H-550)*.25));
  const bottomMargin=Math.max(preferredMargin,38-edges.bottom);
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
    // Reserve an unframed terminal line below the landscape controls.
    dh=Math.max(0,usableH-16-legacyStatsOffset-31);
    sy=edges.top+8;sh=Math.max(0,usableH-16);
    hx=off+8;hw=Math.max(0,left);
    sx=off+left+14;sw=Math.max(0,width-left-right-36);
    dx=off+width-right-8;dw=Math.max(0,right);
  }
  const sideGap=Math.min(ui.sideGap,Math.max(0,sw*.025));
  const sideWidth=Math.min(ui.side,Math.max(0,sw*.36));
  // Spend the existing portrait whitespace on larger touch targets and a
  // fully visible terminal first. Only reduce the board if it runs out.
  const protectedSpace=buttonH-preferredButtonH+extraH-preferredExtraH+
    bottomMargin-preferredMargin;
  const boardSpacing=Math.max(0,legacyStatsOffset-protectedSpace);
  const boardRegionH=landscape?sh:Math.max(0,sh-boardSpacing);
  const brickGap=ui.padGap; // Identical to the horizontal control gap.
  let bw=Math.max(0,Math.min(305,sw-sideWidth-sideGap,boardRegionH/2));
  if(!landscape&&bw>4){
    // V135: anchor the OUTER brick frame (not the board's playable cells)
    // to the header and footer's left edge. Reserve the full 75%-cell-wide
    // rail on both sides and keep the 75%-size preview panel fully visible.
    // Only unusually width-constrained portrait viewports need a small
    // additional board reduction to satisfy both edge alignments.
    const framedSpan=boardWidth=>{
      const tile=Math.max(0,(boardWidth-4)/10)*.75;
      const sidebarPanelWidth=Math.min(sideWidth,
        Math.max(Math.min(sideWidth,52),tile*4+10));
      return boardWidth+2*(tile+brickGap)+sidebarPanelWidth+2;
    };
    if(framedSpan(bw)>hw){
      let lo=4,hi=bw;
      for(let i=0;i<32;i++){
        const mid=(lo+hi)/2;
        if(framedSpan(mid)<=hw)lo=mid;
        else hi=mid;
      }
      bw=lo;
    }
  }
  const bh=bw*2;
  const bx=landscape?sx+Math.max(0,(sw-bw-sideGap-sideWidth)/2):
    hx+Math.max(0,(bw-4)/10)*.75+brickGap;
  // Keep the game board's 10:20 ratio while centering it vertically.
  const by=sy+Math.max(0,(sh-bh)/2);
  // V133: in portrait, align the complete sidebar's RIGHT edge with
  // the header and footer; do not right-align its text labels.
  // Landscape retains its existing three-column arrangement.
  const boardCell=Math.max(0,(bw-4)/10);
  const previewCell=boardCell*.75;
  const firstSideX=bx+bw+sideGap;
  // V141 portrait: match the six-pixel gap on BOTH sides of the right rail.
  // All five sidebar panels still terminate at the unchanged header edge.
  // Landscape retains its previously approved three-column geometry.
  const rightRailEnd=bx+bw+brickGap+previewCell;
  const equalGutterX=rightRailEnd+brickGap;
  const sxSide=landscape?firstSideX:
    Math.min(hx+hw,Math.max(firstSideX,equalGutterX));
  const swSide=landscape?Math.max(0,Math.min(sideWidth,sx+sw-sxSide)):
    Math.max(0,hx+hw-sxSide);
  // V132: compact, equal-width panels share one right edge. NEXT/HOLD each
  // have just one visible preview frame, with a label above its border.
  // The game board and outer sidebar bounds remain untouched.
  const previewLabelSpace=16;
  const panelGap=ui.unit;
  const desiredWidth=previewCell*4+10; // max-size I piece + 5px edge inset
  // Portrait boxes expand to the rail gutter, rather than leaving an
  // uneven strip. Preserve the existing compact landscape sizing.
  const panelWidth=landscape?
    Math.min(swSide,Math.max(Math.min(swSide,52),desiredWidth)):swSide;
  const panelX=sxSide+swSide-panelWidth;
  const previewTarget=panelWidth;
  // V138: three separate SCORE / LEVEL / LINES readouts need room for
  // labels above flat, equal-width displays. Keep the center alignment.
  const statsTarget=Math.min(150,Math.max(104,bh*.32));
  const usablePanelHeight=Math.max(0,bh-2*previewLabelSpace-2*panelGap);
  const targetTotal=2*previewTarget+statsTarget;
  const fit=targetTotal>0?Math.min(1,usablePanelHeight/targetTotal):0;
  let previewH=previewTarget*fit,statsH=statsTarget*fit;
  // A very short portrait may have a wide sidebar but limited vertical
  // height. Reserve legible score rows and let previews become shallower.
  if(!landscape){
    const minStatsH=Math.min(96,usablePanelHeight*.58);
    if(statsH<minStatsH){
      statsH=minStatsH;
      previewH=Math.min(previewTarget,Math.max(0,(usablePanelHeight-statsH)/2));
    }
  }
  const nextPanel={x:panelX,y:by+previewLabelSpace,w:panelWidth,h:previewH};
  const statsPanel={x:panelX,y:by+(bh-statsH)/2,w:panelWidth,h:statsH};
  const holdPanel={x:panelX,y:by+bh-previewH,w:panelWidth,h:previewH};
  const compactControls=landscape&&(dw-2*deckPad)<250;
  return {safe:edges,landscape,short,compact,compactControls,width,off,pad,inner,gap,
    hy,hh,hx,hw,sy,sh,sx,sw,boardX:bx,boardY:by,boardW:bw,boardH:bh,
    sideX:sxSide,sideW:swSide,brickGap,previewCell,previewLabelSpace,holdPanel,nextPanel,statsPanel,dx,dy,dw,dh,
    deckPad,deckGap,buttonH,headerButtonH,extraH,overlaySecondaryH,
    footerY:H-edges.bottom-18};
}
const api=Object.freeze({computeLayout});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FieldAtlasTetrisLayout=api;
})(typeof window!=='undefined'?window:globalThis);
