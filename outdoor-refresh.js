import {listingOutdoorDetails,combineOutdoorDescription,mainGardenArea} from './outdoor-details.js?v=2';
import {readPlanImage,parsePlanText} from './floorplan-ocr.js?v=18';

export const outdoorVersion='outdoors-v2';
export const planFingerprint=p=>(p.floorplans||[]).map(x=>x.sha256||x.path||x.url).join('|');
export function needsOutdoorRefresh(p){
 const previous=p.import_diagnostics?.outdoor_details;
 return p.status!=='deleted'&&(previous?.version!==outdoorVersion||previous.listing_url!==p.url||previous.plan_fingerprint!==planFingerprint(p)||previous.status!=='complete');
}
const same=(a,b)=>a==null?b==null:typeof b==='number'?Number(a)===b:String(a)===String(b);
function canReplace(p,key){
 if(p.manual_overrides?.[key])return false;
 if(p[key]==null||p[key]==='')return true;
 const d=p.import_diagnostics||{};
 return [d.outdoor_details?.values,d.floorplan_measurements?.values,d.source_values].some(source=>source&&Object.hasOwn(source,key)&&same(p[key],source[key]));
}
export function outdoorChanges(p,{listingText,measurements=[],errors=[],now=new Date().toISOString()}={}){
 const prior=p.import_diagnostics||{},sourceText=listingText??prior.listing_text;
 const source=listingOutdoorDetails(sourceText??prior.source_values?.garden_description??p.garden_description??'');
 const planItems=measurements.flatMap(x=>x.outdoor||[]);
 const area=source.garden_area_sqm??mainGardenArea(planItems),notes=combineOutdoorDescription(sourceText??prior.source_values?.garden_description??p.garden_description??'',planItems);
 const changes={},values={...(prior.outdoor_details?.values||{})};
 for(const [key,value] of Object.entries({garden_area_sqm:area,garden_description:notes})){
  if(!canReplace(p,key))continue;
  // An unavailable source is never evidence for deleting an earlier value.
  if(key==='garden_area_sqm'&&value==null||key==='garden_description'&&!value&&sourceText==null)continue;
  if(!same(p[key],value))changes[key]=value;
  values[key]=value;
 }
 changes.import_diagnostics={...prior,...(listingText!=null?{listing_text:listingText}:{}),outdoor_details:{version:outdoorVersion,listing_url:p.url,plan_fingerprint:planFingerprint(p),status:errors.length?'partial':'complete',checked_at:now,values,measurements:planItems,listing_measurements:source.measurements,dimensions_found:area!=null,errors}};
 return changes;
}
// This refresh owns only the two garden fields and its provenance. Every save
// compares the current entire row, including routes, owner comments and dates.
export async function refreshOutdoorProperty({sb,property,readListing,photo,recognize=readPlanImage}){
 const snapshot=structuredClone(property),measurements=[],errors=[];let listingText;
 try{const source=await readListing(snapshot.url);if(!String(source?.listing_text||'').trim())throw Error('Full listing text unavailable');listingText=source.listing_text}
 catch(error){errors.push('Listing: '+String(error?.message||error))}
 for(const plan of snapshot.floorplans||[])try{
  const url=await photo(plan);if(!url||/\.pdf(?:\?|$)/i.test(plan.path||plan.url||url)){errors.push('Floor plan is not an image');continue}
  const response=await fetch(url);if(!response.ok)throw Error('Image download '+response.status);
  const recognized=await recognize(await response.blob());
  const text=[recognized.text,recognized.headerText,recognized.footerText].filter(Boolean).join('\n');
  if(!/\b(?:bedroom|kitchen|bathroom|ground\s+floor|internal\s+area)\b/i.test(text))throw Error('Floor plan text could not be read');
  measurements.push(parsePlanText(text,recognized));
 }catch(error){errors.push('Floor plan: '+String(error?.message||error))}
 for(let attempt=0;attempt<2;attempt++){
  const fresh=await sb.from('properties').select('*').eq('id',snapshot.id).single();if(fresh.error)throw fresh.error;
  const current=fresh.data;if(!current||current.status==='deleted')return {status:'skipped',fields:[]};
  if(current.url!==snapshot.url||planFingerprint(current)!==planFingerprint(snapshot))return {status:'changed',fields:[]};
  const changes=outdoorChanges(current,{listingText,measurements,errors});
  const saved=await sb.rpc('house_hunt_save_manual_edit',{p_id:current.id,p_before:current,p_patch:changes});if(saved.error)throw saved.error;
  if(saved.data===true){Object.assign(property,current,changes);return {status:errors.length?'partial':'complete',fields:Object.keys(changes).filter(k=>k!=='import_diagnostics'),errors,dimensions:changes.import_diagnostics.outdoor_details.dimensions_found}}
 }
 return {status:'changed',fields:[]};
}
