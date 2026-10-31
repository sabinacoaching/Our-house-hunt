// Optional, client-side extraction of labelled measurements from a floor-plan image.
// Never guesses dimensions where no labelled measurements are visible.
let scriptTask=null,workerTask=null;
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
export function parsePlanText(original){
 const text=String(original||'').replace(/[×✕]/g,'x').replace(/(\d),(?=\d{3}\b)/g,'$1').replace(/(\d),(\d)/g,'$1.$2').replace(/\s+/g,' ');
 const result={},areaMatches=[
   /\bapprox(?:imate)?\s+area\s*[:=]\s*(?:\d{3,4}(?:,\d{3})?\s*sq\.?\s*ft\s*\/\s*)?(\d{2,3}(?:\.\d{1,2})?)\s*(?:sq\.?\s*m(?:etres?)?|sqm|m2|m²)(?=\s|$|[.,;])/i,
   /(?:total\s+(?:internal\s+|gross\s+)?(?:floor\s+)?area|gross\s+internal\s+area|gia|approx(?:imate)?\s+floor\s+area)[\s:;./\-]{0,15}.{0,95}?(\d{2,3}(?:\.\d{1,2})?)\s*(?:sq\.?\s*m(?:etres?)?|sqm|m2|m²)(?=\s|$|[.,;])/i,
   /(\d{2,3}(?:\.\d{1,2})?)\s*(?:sq\.?\s*m|sqm|m2|m²).{0,45}?(?:total\s+(?:internal\s+)?area|gross\s+internal\s+area)\b/i,
   /(?:total\s+(?:internal\s+|gross\s+)?(?:floor\s+)?area|gross\s+internal\s+area|gia|approx(?:imate)?\s+floor\s+area)[\s:;./\-]{0,15}.{0,95}?(\d{3,4}(?:\.\d{1,2})?)\s*(?:sq\.?\s*f(?:t|eet)|sq\.?\s*ft|square\s+feet)(?=\s|$|[.,;])/i
 ];
 for(const [i,rx] of areaMatches.entries()){
  const m=text.match(rx);if(m){const n=numeric(m[1].replace(/,(?=\d{3}\b)/g,''));const converted=i===areaMatches.length-1?Math.round(n*0.09290304*100)/100:n;if(converted>=35&&converted<=500){result.floor_area_sqm=converted;break}}
 }
 // A garden measurement must occur immediately after its label on the SAME printed line.
 // Do not join arbitrary room sizes to a garden label elsewhere in the floor plan.
 const gardenLines=String(original||'').split(/[\r\n]+/);
 let garden=null;
 for(const row of gardenLines){
  const candidate=row.replace(/[×✕]/g,'x').replace(/(\d),(\d)/g,'$1.$2').trim()
    .match(/^(?:(?:rear|private|back)\s+)?garden\s*[:( -]?\s*(?:(?:dimensions?|size|measures?|approx(?:imately)?)\s*[: -]?\s*)?(\d{1,2}(?:\.\d{1,2})?)\s*(?:m|metres?)?\s*(?:x|by)\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:m|metres?)\b/i);
  if(candidate){garden=candidate;break}
 }
 // Many original floor plans place the garden label on one OCR line and
 // the dimensions immediately below it, often without printed metric units.
 // Use only the next one or two lines attached to the Garden heading, not
 // arbitrary measurements elsewhere in the plan.
 if(!garden){
  const rows=String(original||'').split(/[\r\n]+/).map(v=>v.trim());
  for(let i=0;i<rows.length;i++){
   if(!/^(?:rear\s+|back\s+|private\s+)?garden\b/i.test(rows[i]))continue;
   const local=rows.slice(i,Math.min(rows.length,i+3)).join(' ').replace(/[×✕]/g,'x');
   const m=local.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:m|metres?)?\s*x\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:m|metres?)?(?=\s|$|[),;])/i);
   if(m&&(/\./.test(m[1])&&/\./.test(m[2])||/\b(?:m|metres?)\b/i.test(local))){garden=m;break}
  }
 }
 // Agency plans sometimes print imperial measurements with metric lengths in parentheses.
 // Example: Garden Approximate 49'3 (15.00) x 16'5 (5.00)
 if(!garden){
  const block=String(original||'').replace(/[×✕]/g,'x').match(/\b(?:rear\s+|private\s+)?garden\s+(?:approx(?:imate)?\s+)?([\s\S]{0,120})/i);
  if(block){
   const pair=block[1].match(/\b\d{1,3}'\d{1,2}\s*\(\s*(\d{1,2}(?:\.\d{1,2})?)\s*\)\s*x\s*\d{1,3}'\d{1,2}\s*\(\s*(\d{1,2}(?:\.\d{1,2})?)\s*\)/i);
   if(pair)garden=pair;
  }
 }
 if(garden){
  const width=numeric(garden[1]),length=numeric(garden[2]),sqm=width*length;
  if(width>1&&width<=40&&length>1&&length<=50&&sqm>=8&&sqm<=1500)result.garden_area_sqm=Math.round(sqm*100)/100;
 }
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
  const worker=await getWorker(),recognized=await worker.recognize(blob);
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
export async function analyzeFloorplan({sb,property,photo}){
 const p=property;
 if(!p?.id||!(p.floorplans||[]).length)return {status:'not-needed'};
 const fingerprint=(p.floorplans||[])[0].path||(p.floorplans||[])[0].url;
 // Existing catalogue plans can be read directly from private Storage, avoiding unnecessary external listing requests.
 // Newly imported plans are archived from the original listing by the Chrome importer.
 const key='hh-plan-ocr-v9:'+p.id+':'+fingerprint;
 let last=0;try{last=Number(localStorage.getItem(key)||0)}catch{}
 if(last&&Date.now()-last<30*86400000)return {status:'already-checked'};
 const imageUrl=await photo(p.floorplans[0]);
 if(!imageUrl||/\.pdf(?:\?|$)/i.test(fingerprint)||/^https:\/\/www\.onthemarket\.com\/details\/\d+\/#\/floorplans\/\d+$/i.test(imageUrl))return {status:'external-floorplan-viewer'};
 const res=await fetch(imageUrl);
 if(!res.ok)throw Error('Cannot read floor plan '+res.status);
 const blob=await res.blob();
 if(!blob.type.startsWith('image/'))return {status:'unsupported-plan'};
 const worker=await getWorker(),recognized=await worker.recognize(blob);
 const ocrText=recognized.data.text||'';
 const planSignals=(ocrText.match(/\b(?:bedroom|bathroom|kitchen|dining\s+room|living\s+room|sitting\s+room|ground\s+floor|first\s+floor|total\s+(?:internal\s+)?floor\s+area|en[ -]?suite)\b/gi)||[]).length;
 if(planSignals<2)return {status:'unverified-floorplan-image'};
 const measurements=parsePlanText(ocrText),changes={};
 // Total floor area printed on the plan has priority over an approximate listing value.
 if(!p.manual_overrides?.floor_area_sqm&&measurements.floor_area_sqm!=null&&Math.abs(Number(p.floor_area_sqm)-measurements.floor_area_sqm)>0.2)changes.floor_area_sqm=measurements.floor_area_sqm;
 if(!p.manual_overrides?.floor_area_sqm&&p.floor_area_sqm==null&&measurements.floor_area_sqm!=null)changes.floor_area_sqm=measurements.floor_area_sqm;
 if(!p.manual_overrides?.garden_area_sqm&&p.garden_area_sqm==null&&measurements.garden_area_sqm!=null)changes.garden_area_sqm=measurements.garden_area_sqm;
 if(!p.manual_overrides?.floors&&p.floors==null&&measurements.floors!=null)changes.floors=measurements.floors;
 // Portal bathrooms count can include a separate WC; use labelled plan rooms only
 // when their total agrees with the total reported in the source, or the source did not give a count.
 const labelled=measurements.plan_bathrooms,standalone=measurements.plan_separate_wcs;
 const portalCount=p.bathrooms==null?null:Number(p.bathrooms);const existingTotal=portalCount==null?null:portalCount+(p.wc_count==null?0:Number(p.wc_count));
 if(labelled!=null&&(portalCount==null||labelled+standalone===portalCount||labelled+standalone===existingTotal)){
   if(!p.manual_overrides?.bathrooms&&p.bathrooms!==labelled)changes.bathrooms=labelled;
   if(!p.manual_overrides?.wc_count&&p.wc_count!==standalone)changes.wc_count=standalone;
 }
 // Cache only successful readable plans; failed extraction is retried at a later visit.
 if(Object.keys(measurements).length)try{localStorage.setItem(key,String(Date.now()))}catch{}
 if(!Object.keys(changes).length)return {status:'no-labelled-measurements'};
 const saved=await sb.from('properties').update(changes).eq('id',p.id).select('id').single();
 if(saved.error)throw saved.error;
 Object.assign(p,changes);
 return {status:'saved',fields:Object.keys(changes)};
}