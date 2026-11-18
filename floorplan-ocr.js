import {outdoorMeasurements,mainGardenArea,combineOutdoorDescription,retainOutdoorMeasurements} from './outdoor-details.js?v=3';
// Optional, client-side extraction of labelled measurements from a floor-plan image.
// Never guesses dimensions where no labelled measurements are visible.
let scriptTask=null,workerTask=null,ocrTail=Promise.resolve();
const serialOcr=task=>{const next=ocrTail.then(task);ocrTail=next.catch(()=>{});return next};
function loadScript(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(scriptTask)return scriptTask;
 scriptTask=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  script.async=true;
  const timer=setTimeout(()=>{script.remove();reject(Error('OCR library timed out'))},15000);
  script.onload=()=>{clearTimeout(timer);window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('OCR library unavailable'))};
  script.onerror=()=>{clearTimeout(timer);reject(Error('OCR library could not be loaded'))};
  document.head.append(script);
 }).catch(e=>{scriptTask=null;throw e});
 return scriptTask;
}
async function getWorker(){
 if(!workerTask){workerTask=loadScript().then(t=>t.createWorker('eng')).catch(e=>{workerTask=null;throw e})}
 return workerTask;
}
const numeric=s=>Number(String(s).replace(',','.'));
function pairedArea(text,tolerant=false){
 if(tolerant)text=String(text||'').replace(/(?<![a-z])(?:[so59]?q|sq)\s*m\b/gi,'sq m').replace(/(?<![a-z])(?:[so59]?q|sa|69)\s*(?:ft|tt)\b/gi,'sq ft');
 const pairs=[];
 for(const m of String(text||'').matchAll(/(\d{2,3}(?:\.\d{1,2})?)\s*\.?\s*(?:sq\.?\s*m|sqm|m2|m²)\s*[/=\-]\s*(\d{3,4}(?:\.\d+)?)\s*\.?\s*(?:sq\.?\s*ft|sqft|sq\.?\s*feet)/gi)){
  const metric=Number(m[1]),feet=Number(m[2])*.09290304;
  if(metric>=35&&metric<=500&&Math.abs(metric-feet)<Math.max(1,metric*.015))pairs.push(metric);
 }
 return pairs;
}
export function parsePlanText(original,{headerText='',footerText=''}={}){
 const text=String(original||'').replace(/[×✕]/g,'x').replace(/(\d),(?=\d{3}\b)/g,'$1').replace(/(\d),(\d)/g,'$1.$2').replace(/\s+/g,' ');
 const result={},areaMatches=[
   /\bapprox(?:imate)?\s+area\s*[:=]\s*(?:\d{3,4}(?:,\d{3})?\s*sq\.?\s*ft\s*\/\s*)?(\d{2,3}(?:\.\d{1,2})?)\s*\.?\s*(?:sq\.?\s*m(?:etres?)?|sqm|m2|m²)(?=\s|$|[.,;/()\-])/i,
   /(?:total\s+(?:internal\s+|gross\s+)?(?:floor\s+)?area|gross\s+internal\s+(?:floor\s+)?area|(?<!gross\s)internal\s+area|gia|approx(?:imate)?\.?\s+(?:total\s+)?(?:floor\s+)?area)[\s:;./\-]{0,15}.{0,95}?(\d{2,3}(?:\.\d{1,2})?)\s*\.?\s*(?:sq\.?\s*m(?:etres?)?|sqm|m2|m²)(?=\s|$|[.,;/()\-])/i,
   /(\d{2,3}(?:\.\d{1,2})?)\s*\.?\s*(?:sq\.?\s*m|sqm|m2|m²).{0,45}?(?:total\s+(?:internal\s+)?area|gross\s+internal\s+area)\b/i,
   /(?:total\s+(?:internal\s+|gross\s+)?(?:floor\s+)?area|gross\s+internal\s+(?:floor\s+)?area|gia|approx(?:imate)?\s+floor\s+area)[\s:;./\-]{0,15}.{0,95}?(\d{3,4}(?:\.\d{1,2})?)\s*\.?\s*(?:sq\.?\s*f(?:t|eet)|sq\.?\s*ft|square\s+feet)(?=\s|$|[.,;/()\-])/i
 ];
 const candidates=[];
 for(const [i,rx] of areaMatches.entries()){
  const matches=Array.from(text.matchAll(new RegExp(rx.source,rx.flags+'g'))).filter(m=>!/(?:garage|outbuilding|storage|external|(?:ground|first|second|third)\s+floor)\s*(?:[-:,.]\s*)?$/i.test(text.slice(0,m.index)));
  for(const m of matches){
   if(i===2&&/\b(?:area|gia)\b/i.test(text.slice(Math.max(0,m.index-110),m.index)))continue;
   const n=numeric(m[1].replace(/,(?=\d{3}\b)/g,'')),feet=i===areaMatches.length-1,value=feet?Math.round(n*.09290304*100)/100:n;if(value<35||value>500)continue;
   const rank=/without\s+garage|excl(?:uding|\.)?\s+garage/i.test(m[0])?-2:/with\s+garage|including\s+garage/i.test(m[0])?20:/gross\s+internal|\bgia\b/i.test(m[0])?0:/total\s+internal/i.test(m[0])?1:/internal\s+area/i.test(m[0])?2:5;
   candidates.push({value,rank:rank+(feet?.5:0),index:m.index});
  }
 }
 candidates.sort((a,b)=>a.rank-b.rank||a.index-b.index);if(candidates.length)result.floor_area_sqm=candidates[0].value;
 // Tiny grey headings may be unreadable. Accept their number only when the
 // same metric/imperial pair independently agrees in BOTH image bands.
 if(result.floor_area_sqm==null){const top=pairedArea(headerText),bottom=pairedArea(footerText,true);const agreed=[...new Set(top.filter(n=>bottom.some(v=>Math.abs(n-v)<.05)))];if(agreed.length===1)result.floor_area_sqm=agreed[0]}
 result.outdoor=outdoorMeasurements(original);
 const garden=mainGardenArea(result.outdoor);if(garden!=null)result.garden_area_sqm=garden;
 // Count storeys only when the plan explicitly labels a ground floor and subsequent levels.
 const planLabels=String(original||'');
 if(/\bground\s+floor\b/i.test(planLabels)&&/\bfirst\s+floor\b/i.test(planLabels)){
  result.floors=/\bthird\s+floor\b/i.test(planLabels)?4:/\bsecond\s+floor\b/i.test(planLabels)?3:2;
 }
 // Room labels are authoritative for bathroom/WC classification, unlike the portal's combined count.
 // Only count room labels occupying their own OCR line. An unlabelled room is left unknown.
 const labelLines=String(original||'').split(/[\r\n]+/).map(line=>line.trim().replace(/\s+/g,' '));
 let wetRooms=0,wcRooms=0;
 for(const line of labelLines){
   if(/^(?:bathroom|bath room|shower(?:\s*room)?|wet\s*room|en[\s-]?suite(?:\s*(?:bath|shower)?room)?)(?:\s*[1-4])?\s*(?:[(]\s*\d.*[)])?$/i.test(line))wetRooms++;
   else if(/^(?:w\.?\s*c\.?|toilet|cloakroom(?:\s+w\.?\s*c\.?)?|guest\s+w\.?\s*c\.?)(?:\s*[1-4])?\s*$/i.test(line))wcRooms++;
 }
 if(wetRooms>0&&wetRooms<=8&&wcRooms<=5){
   result.plan_bathrooms=wetRooms;
   result.plan_separate_wcs=wcRooms;
 }
 return result;
}
export async function readPlanImage(blob){
 return serialOcr(async()=>{
  const worker=await getWorker();let bitmap;
  try{
   if(typeof createImageBitmap!=='function'||typeof document==='undefined'){
    const data=(await worker.recognize(blob)).data;return {text:data.text||'',headerText:'',footerText:''};
   }
   bitmap=await createImageBitmap(blob);
   const scale=Math.min(3,2400/bitmap.width),canvas=document.createElement('canvas');
   const draw=(y,height)=>{
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(height*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,y,bitmap.width,height,0,0,canvas.width,canvas.height);return canvas;
   };
   await worker.setParameters({tessedit_pageseg_mode:'3'});
   const full=(await worker.recognize(draw(0,bitmap.height))).data;
   let text=full.text||'';
   // A sparse-text pass also finds labels inside bordered garden boxes, which
   // the whole-page layout pass can classify as part of the drawing.
   await worker.setParameters({tessedit_pageseg_mode:'11'});
   const sparse=(await worker.recognize(draw(0,bitmap.height))).data;
   await worker.setParameters({tessedit_pageseg_mode:'6'});
   const head=(await worker.recognize(draw(0,Math.ceil(bitmap.height*.12)))).data;
   let headerText=head.text||'';
   const footerStart=Math.floor(bitmap.height*.78),footerText=(await worker.recognize(draw(footerStart,bitmap.height-footerStart))).data.text||'';
   // Re-read small outdoor labels and their nearby dimensions as one local
   // text block. A whole-page layout pass often separates these three lines.
   const labels=[...(full.lines||[]),...(sparse.lines||[])].filter(line=>/^\s*(?:(?:front|rear|back)\s+)?(?:gardens?|driveway|parking)\s*$/i.test(line.text||''));
   for(const word of sparse.words||[]){
    if(!/^(?:gardens?|driveway|parking)$/i.test((word.text||'').trim()))continue;
    const parent=(sparse.lines||[]).find(line=>line.bbox.x0<=word.bbox.x0&&line.bbox.x1>=word.bbox.x1&&line.bbox.y0<=word.bbox.y0&&line.bbox.y1>=word.bbox.y1);
    if(/\b(?:to|onto|access to)\s+garden\b/i.test(parent?.text||''))continue;
    const qualified=parent?.text?.match(/\b(?:front|rear|back)\s+gardens?\b/i)?.[0];labels.push({...word,text:qualified||word.text});
   }
   const boxes=labels.filter((line,i,all)=>!all.slice(0,i).some(x=>Math.abs(x.bbox.x0-line.bbox.x0)<12&&Math.abs(x.bbox.y0-line.bbox.y0)<12)).slice(0,8);
   const outdoorText=[];
   for(const line of boxes){
    const box=line.bbox,cx=(box.x0+box.x1)/(2*scale),y=Math.max(0,box.y0/scale-8),labelHeight=(box.y1-box.y0)/scale,width=Math.min(bitmap.width,Math.max(140,(box.x1-box.x0)/scale+labelHeight*7)),x=Math.max(0,Math.min(bitmap.width-width,cx-width/2)),height=Math.min(bitmap.height-y,Math.max(70,labelHeight*5));
    const zoom=Math.min(6,1400/width);canvas.width=Math.round(width*zoom);canvas.height=Math.round(height*zoom);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,x,y,width,height,0,0,canvas.width,canvas.height);
    const local=(await worker.recognize(canvas)).data.text||'';outdoorText.push(line.text+'\n'+local);
   }
   if(outdoorText.length)text+='\n'+outdoorText.join('\n');
   const areaHeadings=[];
   // Small grey headings need their own line pass, rather than competing with
   // the much larger address/number. The crop is located by the observed total,
   // and only reads the strip immediately above that printed number.
   await worker.setParameters({tessedit_pageseg_mode:'7'});
   for(const value of [...new Set(pairedArea(headerText))].slice(0,3)){
    const word=(head.words||[]).find(w=>parseFloat(String(w.text).replace(',','.'))===value);if(!word?.bbox)continue;
    const x=Math.max(0,word.bbox.x0/scale-60),bottom=Math.max(0,word.bbox.y0/scale-2),y=Math.max(0,bottom-20),width=Math.min(300,bitmap.width-x),height=bottom-y;if(height<4)continue;
    canvas.width=Math.round(width*8);canvas.height=Math.round(height*8);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,x,y,width,height,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){const ink=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<210?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=ink}ctx.putImageData(pixels,0,0);
    const label=(await worker.recognize(canvas)).data.text||'';areaHeadings.push(label);
   }
   if(areaHeadings.length)headerText=areaHeadings.join('\n')+'\n'+headerText;
   return {text,headerText,footerText,outdoorText,areaHeadings};
  }finally{bitmap?.close?.();if(worker.setParameters)await worker.setParameters({tessedit_pageseg_mode:'3'})}
 });
}
export function floorplanChanges(p,measurements,{fingerprint='',listingText,now=new Date().toISOString()}={}){
 const prior=p.import_diagnostics?.floorplan_measurements,source=p.import_diagnostics?.source_values||{},changes={};
 const same=(a,b)=>a==null?b==null:typeof b==='number'?Number(a)===b:String(a)===String(b);
 const allowed=key=>!p.manual_overrides?.[key]&&(p[key]==null||p[key]===''||Object.hasOwn(source,key)&&same(p[key],source[key])||Object.hasOwn(prior?.values||{},key)&&same(p[key],prior.values[key])||Object.hasOwn(p.import_diagnostics?.outdoor_details?.values||{},key)&&same(p[key],p.import_diagnostics.outdoor_details.values[key]));
 for(const key of ['floor_area_sqm','garden_area_sqm','floors']){
  // The owner's priority is the advertised area; the plan only fills a missing floor area.
  const savedPlanFallback=key==='floor_area_sqm'&&source.floor_area_sqm==null&&prior?.values?.floor_area_sqm!=null&&Number(p[key])===Number(prior.values.floor_area_sqm);
  if(key==='floor_area_sqm'&&p[key]!=null&&p[key]!==''&&!savedPlanFallback)continue;
  if(measurements[key]!=null&&allowed(key)&&!same(p[key],measurements[key]))changes[key]=measurements[key];
 }
 const raw=listingText??p.import_diagnostics?.listing_text??source.garden_description??p.garden_description??'';
 const outdoorRecord=p.import_diagnostics?.outdoor_details;
 const planFingerprint=(p.floorplans||[]).map(x=>x.sha256||x.path||x.url).join('|');
 const known=outdoorRecord?.plan_fingerprint===planFingerprint?outdoorRecord.measurements||[]:prior?.fingerprint===fingerprint?prior.outdoor||[]:[];
 const outdoor=retainOutdoorMeasurements(measurements.outdoor||[],known);
 const description=combineOutdoorDescription(raw,outdoor);
 if(description&&allowed('garden_description')&&!same(p.garden_description,description))changes.garden_description=description;
 // Keep the exact inputs/provenance separate from the combined human-facing notes.
 const values={...(prior?.values||{}),...Object.fromEntries(Object.entries(changes))};
 for(const key of ['floor_area_sqm','garden_area_sqm','floors'])if(measurements[key]!=null&&!p.manual_overrides?.[key]&&same(p[key],measurements[key]))values[key]=measurements[key];
 const labelled_values=Object.fromEntries(['floor_area_sqm','garden_area_sqm','floors'].filter(k=>measurements[k]!=null).map(k=>[k,measurements[k]]));
 const diagnostic={version:'labelled-plan-v12',fingerprint,values,labelled_values,outdoor,checked_at:now};
 changes.import_diagnostics={...(p.import_diagnostics||{}),...(listingText!=null?{listing_text:listingText}:{}),floorplan_measurements:diagnostic};
 return changes;
}
// Reject photos mistakenly categorised as floor plans by a listing's gallery.
// Conservative validation: an unrecognisable image is not silently stored as a plan.
// Every candidate comes from the original listing. Use OCR plus image-layout evidence:
// small or low-contrast plans can be diagrams even if OCR reads few room labels.
export async function inspectFloorplanImage(blob){
 const result={accepted:false,reason:"unreadable-image",ocr_labels:0,white_fraction:null,visual_diagram:false};
 if(!blob?.type?.startsWith('image/'))return {...result,reason:"not-an-image"};
 let bitmap;
 try{
  bitmap=await createImageBitmap(blob);
  const w=bitmap.width,h=bitmap.height;
  if(w<180||h<140)return {...result,reason:"image-too-small",width:w,height:h};
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(ctx){
   ctx.drawImage(bitmap,0,0,96,96);
   const pixels=ctx.getImageData(0,0,96,96).data;
   let whites=0,neutral=0,darks=0,count=0;
   for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2],lum=(r+g+b)/3;
    if(Math.min(r,g,b)>224)whites++;
    if(Math.max(r,g,b)-Math.min(r,g,b)<24)neutral++;
    if(lum<105)darks++;
    count++;
   }
   result.white_fraction=Math.round(1000*whites/count)/1000;
   result.visual_diagram=whites/count>.58&&neutral/count>.64&&darks/count>.008&&darks/count<.36;
  }
  result.width=w;result.height=h;
 }catch(e){result.reason="image-decoding-failed: "+String(e).slice(0,120);return result}
 finally{bitmap?.close?.()}
 try{
  const recognized=await serialOcr(async()=>{const worker=await getWorker();return worker.recognize(blob)});
  const txt=String(recognized.data?.text||'');
  const matches=txt.match(/\b(?:bedroom|bathroom|kitchen|reception|living\s+room|dining\s+room|ground\s+floor|first\s+floor|second\s+floor|floor\s*area|approx(?:imate)?\s+area|en[\s-]?suite|garden|shower\s+room|sitting\s+room)\b/gi)||[];
  const variety=new Set(matches.map(v=>v.toLowerCase()));
  result.ocr_labels=matches.length;
  if(matches.length>=2&&variety.size>=2)result.accepted=true;
  else if(parsePlanText(txt).floor_area_sqm!=null&&matches.length>=1)result.accepted=true;
  else if(result.visual_diagram)result.accepted=true;
  result.reason=result.accepted?'verified-plan':matches.length?'insufficient-labels-and-not-a-diagram':'ocr-no-plan-labels-and-not-a-diagram';
 }catch(e){
  // OCR is not infallible. Accept high-confidence visual diagrams even when
  // Tesseract cannot read faint or very small room lettering.
  if(result.visual_diagram){result.accepted=true;result.reason="verified-visual-diagram"}
  else result.reason="ocr-error: "+String(e).slice(0,120);
 }
 return result;
}
export async function validateFloorplanImage(blob){
 return (await inspectFloorplanImage(blob)).accepted;
}
export async function analyzeFloorplan({sb,property,photo,recognize=readPlanImage,force=false}){
 const p=property;
 if(!p?.id||!(p.floorplans||[]).length)return {status:'not-needed'};
 const fingerprint=(p.floorplans||[])[0].path||(p.floorplans||[])[0].url;
 // Existing catalogue plans can be read directly from private Storage, avoiding unnecessary external listing requests.
 // Newly imported plans are archived from the original listing by the Chrome importer.
 const key='hh-plan-ocr-v12:'+p.id+':'+fingerprint;
 let last=0;try{last=Number(localStorage.getItem(key)||0)}catch{}
 if(!force&&last&&Date.now()-last<30*86400000)return {status:'already-checked'};
 const imageUrl=await photo(p.floorplans[0]);
 if(!imageUrl||/\.pdf(?:\?|$)/i.test(fingerprint)||/^https:\/\/www\.onthemarket\.com\/details\/\d+\/#\/floorplans\/\d+$/i.test(imageUrl))return {status:'external-floorplan-viewer'};
 const res=await fetch(imageUrl);
 if(!res.ok)throw Error('Cannot read floor plan '+res.status);
 const blob=await res.blob();
 if(!blob.type.startsWith('image/'))return {status:'unsupported-plan'};
 const recognized=await recognize(blob),ocrText=recognized.text||'';
 const planSignals=(ocrText.match(/\b(?:bedroom|bathroom|kitchen|dining\s+room|living\s+room|sitting\s+room|ground\s+floor|first\s+floor|total\s+(?:internal\s+)?floor\s+area|en[ -]?suite)\b/gi)||[]).length;
 if(planSignals<2)return {status:'unverified-floorplan-image'};
 const measurements=parsePlanText([ocrText,recognized.headerText,recognized.footerText].filter(Boolean).join('\n'),recognized);
 const fresh=await sb.from('properties').select('*').eq('id',p.id).single();if(fresh.error)throw fresh.error;if(!fresh.data)return {status:'house-not-found'};
 if((fresh.data.floorplans?.[0]?.path||fresh.data.floorplans?.[0]?.url)!==fingerprint)return {status:'concurrent-edit'};
 const current=fresh.data,changes=floorplanChanges(current,measurements,{fingerprint});
 // Portal bathrooms count can include a separate WC; use labelled plan rooms only
 // when their total agrees with the total reported in the source, or the source did not give a count.
 const labelled=measurements.plan_bathrooms,standalone=measurements.plan_separate_wcs;
 const portalCount=current.bathrooms==null?null:Number(current.bathrooms);const existingTotal=portalCount==null?null:portalCount+(current.wc_count==null?0:Number(current.wc_count));
 if(labelled!=null&&(portalCount==null||labelled+standalone===portalCount||labelled+standalone===existingTotal)){
   if(!current.manual_overrides?.bathrooms&&current.bathrooms==null)changes.bathrooms=labelled;
   if(!current.manual_overrides?.wc_count&&current.wc_count==null&&standalone>0)changes.wc_count=standalone;
 }
 const fields=Object.keys(changes).filter(k=>k!=='import_diagnostics');
 if(!measurements.floor_area_sqm&&!measurements.outdoor?.length&&!fields.length)return {status:'no-labelled-measurements'};
 const saved=await sb.rpc('house_hunt_save_manual_edit',{p_id:p.id,p_before:current,p_patch:changes});
 if(saved.error)throw saved.error;
 if(saved.data!==true)return {status:'concurrent-edit'};
 if(Object.keys(measurements).length)try{localStorage.setItem(key,String(Date.now()))}catch{}
 Object.assign(p,current,changes);
 return {status:fields.length?'saved':'checked',fields};
}
