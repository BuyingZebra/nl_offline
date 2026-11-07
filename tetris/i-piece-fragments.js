/* NOMAD piece-instance layout. Rendering only; game rules and board cell kinds
 * remain untouched. A contiguous I fragment must belong to ONE locked piece,
 * have consecutive original source indexes, and be physically adjacent in the
 * same direction. Clearing rows never re-seeds the remaining texture.
 */
export function collectIFragments(board,metadata,{hiddenRows=null}={}){
 const grouped=new Map(),missing=[];
 const hidden=y=>hiddenRows?.has(y)===true;
 for(let y=0;y<board.length;y++)for(let x=0;x<(board[y]?.length||0);x++){
  if(board[y][x]!=='I'||hidden(y))continue;
  const cell=metadata?.[y]?.[x];
  const valid=cell?.kind==='I'&&Number.isSafeInteger(cell.pieceId)&&
   cell.pieceId>0&&Number.isInteger(cell.sourceIndex)&&
   cell.sourceIndex>=0&&cell.sourceIndex<4&&
   Number.isInteger(cell.rotation)&&cell.rotation>=0&&cell.rotation<=3;
  if(!valid){
   missing.push(Object.freeze({x,y,pieceId:null,sourceOffset:0,length:1,rotation:0,untracked:true}));
   continue;
  }
  if(!grouped.has(cell.pieceId))grouped.set(cell.pieceId,[]);
  grouped.get(cell.pieceId).push({x,y,pieceId:cell.pieceId,index:cell.sourceIndex,rotation:cell.rotation});
 }
 const runs=[];
 for(const entries of grouped.values()){
  entries.sort((a,b)=>a.index-b.index);
  let group=[];
  const emit=()=>{
   if(!group.length)return;
   runs.push(Object.freeze({
    pieceId:group[0].pieceId,
    x:Math.min(...group.map(e=>e.x)),
    y:Math.min(...group.map(e=>e.y)),
    sourceOffset:group[0].index,
    length:group.length,
    rotation:group[0].rotation,
    untracked:false
   }));
   group=[];
  };
  for(const entry of entries){
   if(group.length){
    const last=group[group.length-1],dr=entry.rotation;
    // 0=right,1=down,2=left,3=up in source-index order.
    const dx=[1,0,-1,0][dr],dy=[0,1,0,-1][dr];
    if(dr!==last.rotation||entry.index!==last.index+1||
      entry.x!==last.x+dx||entry.y!==last.y+dy)emit();
   }
   group.push(entry);
  }
  emit();
 }
 return Object.freeze([...runs,...missing].sort((a,b)=>a.y-b.y||a.x-b.x||String(a.pieceId).localeCompare(String(b.pieceId))));
}
