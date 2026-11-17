/* Extended nominal WS5 crosstalk calibration for fixed-width STN panels.
 * Exact equations translated from JohnnySun/retro-display-lab:
 * reference/passive-matrix-crosstalk-lumped.mjs
 * tools/build-dmg01-ws5-lumped.mjs
 * The 144-row result is verified against all four source baseline tables.
 */
const COLS=160,SUBSTEPS=8,baseRows=144;
const CAP=.7413839530238e-12;
const RLEAK=1e11*.01*6e-6/6.713541666666667e-8;
const DT=36.24133333333333e-6/SUBSTEPS;
const calibrationCache=new Map();
function scalar(src,key){
 const m=src.match(new RegExp('const float '+key+' = ([0-9.eE+-]+);'));
 if(!m)throw Error('Missing source coefficient '+key);
 return +m[1];
}
function factors(n){
 const a=n*CAP/DT,b=n/RLEAK,c=1/20000,d=a+b+c;
 return {memory:a/d,leakage:b/d,driver:c/d};
}
function geom(a){return a*(1-a**SUBSTEPS)/(1-a);}
function shadeVoltages(rows,ra,ca){
 return [0,1,2,3].map(v=>Math.sqrt(((v/3)*(ra+ca)**2+
 (1-v/3)*(ra-ca)**2+(rows-1)*ca*ca)/rows));
}
function shadeCoordinate(volts,levels){
 if(volts<=levels[0])return 0;
 if(volts>=levels[3])return 3;
 for(let i=0;i<3;i++)if(volts<=levels[i+1])
  return i+(volts-levels[i])/(levels[i+1]-levels[i]);
 return 3;
}
function uniformDrive(rows,targetY,shade,rs,cs,ra,ca,rf,cf,levels){
 let rowState=0,columnState=0,oldRow=0,oldColumn=0,sum=0;
 const gr=geom(rf.memory),gc=geom(cf.memory);
 const gr2=geom(rf.memory**2),gc2=geom(cf.memory**2);
 const grc=geom(rf.memory*cf.memory);
 for(let f=0;f<2;f++){
  const polarity=f%2?-1:1;
  const rowMean=polarity*ra/rows;
  for(let y=0;y<rows;y++){
   const selected=y===targetY?polarity*ra:0;
   for(let phase=0;phase<3;phase++){
    const column=polarity*(phase<shade?-ca:ca);
    const rowEq=(rf.leakage*column+rf.driver*selected)/(1-rf.memory);
    const colEq=(cf.leakage*rowMean+cf.driver*column)/(1-cf.memory);
    const rowVirtual=rowState-oldColumn+column;
    const colVirtual=columnState-oldRow+rowMean;
    const ideal=selected-column;
    const constant=ideal+rs*(rowEq-selected)-cs*(colEq-column);
    const tr=rs*(rowVirtual-rowEq);
    const tc=-cs*(colVirtual-colEq);
    if(f===1)sum+=SUBSTEPS*constant**2+
      tr**2*gr2+tc**2*gc2+2*constant*tr*gr+
      2*constant*tc*gc+2*tr*tc*grc;
    rowState=rowEq;columnState=colEq;
    oldRow=rowMean;oldColumn=column;
   }
  }
 }
 return shadeCoordinate(Math.sqrt(sum/(rows*3*SUBSTEPS)),levels);
}
function compute(rows,src,columns=COLS){
 const ra=scalar(src,'DMG_CROSSTALK_ROW_AMPLITUDE');
 const ca=scalar(src,'DMG_CROSSTALK_COLUMN_AMPLITUDE');
 const rf=factors(columns),cf=factors(rows),levels=shadeVoltages(rows,ra,ca);
 if(columns===COLS&&Math.abs(rf.memory-scalar(src,'DMG_CROSSTALK_ROW_MEMORY'))>1e-6)
  throw Error('Nominal row RC coefficients differ from upstream');
 if(rows===baseRows&&Math.abs(cf.memory-scalar(src,'DMG_CROSSTALK_COLUMN_MEMORY'))>1e-6)
  throw Error('Nominal column RC coefficients differ from upstream');
 const baselines={};
 for(const [id,rs,cs] of [['00',0,0],['10',1,0],['01',0,1],['11',1,1]]){
  const a=new Float64Array(rows*4);
  for(let y=0;y<rows;y++)for(let shade=0;shade<4;shade++){
   a[y*4+shade]=id==='00'?shade:
    uniformDrive(rows,y,shade,rs,cs,ra,ca,rf,cf,levels);
  }
  baselines[id]=a;
 }
 return {baselines,rf,cf,levels};
}
function originalCheck(src){
 if(calibrationCache.has('checked'))return;
 const data=compute(144,src);
 let max=0;
 for(const id of ['00','10','01','11']){
  const m=src.match(new RegExp('const float DMG_CROSSTALK_UNIFORM_'+id+'\\[576\\] = float\\[\\]\\(([^;]+)\\);'));
  if(!m)throw Error('Source baseline missing: '+id);
  const ref=m[1].split(',').map(Number);
  for(let i=0;i<576;i++)max=Math.max(max,Math.abs(data.baselines[id][i]-ref[i]));
 }
 if(max>1e-5)throw Error('Upstream source parity failed: maximum deviation '+max);
 calibrationCache.set('checked',true);
}
export function extendDmgCalibration(source,rows,columns=COLS){
 rows=Math.round(rows);
 columns=Math.round(columns);
 if(rows<144||rows>694||columns<160||columns>320)
  throw Error('Unsupported panel dimensions '+columns+'x'+rows);
 originalCheck(source);
 if(rows===144&&columns===COLS)return source;
 const key=columns+'x'+rows;
 if(calibrationCache.has(key))return calibrationCache.get(key);
 const d=compute(rows,source,columns);
 let result=source.replace('const int DMG_CROSSTALK_ROWS = 144;',
   'const int DMG_CROSSTALK_ROWS = '+rows+';')
   .replace('const int DMG_CROSSTALK_COLUMNS = 160;',
   'const int DMG_CROSSTALK_COLUMNS = '+columns+';');
 const params={
  DMG_CROSSTALK_ROW_MEMORY:d.rf.memory,
  DMG_CROSSTALK_ROW_LEAKAGE:d.rf.leakage,
  DMG_CROSSTALK_ROW_DRIVER:d.rf.driver,
  DMG_CROSSTALK_COLUMN_MEMORY:d.cf.memory,
  DMG_CROSSTALK_COLUMN_LEAKAGE:d.cf.leakage,
  DMG_CROSSTALK_COLUMN_DRIVER:d.cf.driver
 };
 for(const [key,value] of Object.entries(params)){
  const regex=new RegExp('(const float '+key+' = )[0-9.eE+-]+;');
  if(!regex.test(result))throw Error('Missing '+key);
  result=result.replace(regex,(_,start)=>start+value.toFixed(12)+';');
 }
 const shades=/const float DMG_CROSSTALK_SHADE_VOLTS\[4\] = float\[\]\([^;]+\);/;
 if(!shades.test(result))throw Error('Missing original shade-voltage table');
 result=result.replace(shades,'const float DMG_CROSSTALK_SHADE_VOLTS[4] = float[]('+d.levels.map(x=>x.toFixed(12)).join(', ')+');');
 for(const id of ['00','10','01','11']){
  const regex=new RegExp('const float DMG_CROSSTALK_UNIFORM_'+id+'\\[576\\] = float\\[\\]\\([^;]+\\);');
  if(!regex.test(result))throw Error('Missing original uniform baseline '+id);
  const vals=Array.from(d.baselines[id],v=>v.toFixed(12));
  result=result.replace(regex,'const float DMG_CROSSTALK_UNIFORM_'+id+'['+(rows*4)+'] = float[]('+vals.join(', ')+');');
 }
 calibrationCache.set(key,result);
 return result;
}
