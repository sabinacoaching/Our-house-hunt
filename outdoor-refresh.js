import {listingOutdoorDetails,combineOutdoorDescription,mainGardenArea,retainOutdoorMeasurements} from './outdoor-details.js?v=4';
import {readPlanImage,parsePlanText,floorplanChanges} from './floorplan-ocr.js?v=20';
import {importChanges} from './import-utils.js';

export const outdoorVersion='measurements-v4';
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
export function outdoorChanges(p,{listingText,listingData,measurements=[],errors=[],now=new Date().toISOString()}={}){
 const prior=p.import_diagnostics||{},hasListingText=!!String(listingText||'').trim(),sourceText=hasListingText?listingText:prior.listing_text;
 const source=listingOutdoorDetails(sourceText??prior.source_values?.garden_description??p.garden_description??'');
 const known=prior.outdoor_details?.plan_fingerprint===planFingerprint(p)?prior.outdoor_details.measurements||[]:[];
 const planItems=retainOutdoorMeasurements(measurements.flatMap(x=>x.outdoor||[]),known);
 const candidates=[mainGardenArea([...source.measurements,...planItems]),source.garden_area_sqm].filter(x=>x!=null);
 const area=candidates.length?Math.max(...candidates):null,notes=combineOutdoorDescription(sourceText??prior.source_values?.garden_description??p.garden_description??'',planItems);
 const changes={},values={...(prior.outdoor_details?.values||{})};
 for(const [key,value] of Object.entries({garden_area_sqm:area,garden_description:notes})){
  if(!canReplace(p,key))continue;
  // An unavailable source is never evidence for deleting an earlier value.
  if(key==='garden_area_sqm'&&value==null||key==='garden_description'&&!value)continue;
  if(!same(p[key],value))changes[key]=value;
  values[key]=value;
 }
 // Reconcile house area in this same save, with the published facts-card area
 // first and labelled plan total as fallback. An absent result never clears data.
 const card=listingData?.floor_area_sqm;
 const advertised=card!=null&&Number.isFinite(Number(card))&&Number(card)>0?Number(card):null;
 const sourceValues={...(prior.source_values||{}),...(advertised!=null?{floor_area_sqm:advertised}:{})};
 if(advertised!=null)Object.assign(changes,importChanges(p,{floor_area_sqm:advertised}));
 const current={...p,...changes,import_diagnostics:{...prior,source_values:sourceValues}};
 const total=measurements.find(x=>x.floor_area_sqm!=null)?.floor_area_sqm;
 const floors=measurements.find(x=>x.floors!=null)?.floors;
 const plan=measurements.length?floorplanChanges(current,{outdoor:planItems,...(total!=null?{floor_area_sqm:total}:{}),...(floors!=null?{floors}:{})},{fingerprint:p.floorplans?.[0]?.path||p.floorplans?.[0]?.url||'',listingText:sourceText,now}):null;
 for(const key of ['floor_area_sqm','floors'])if(plan&&Object.hasOwn(plan,key))changes[key]=plan[key];
 changes.import_diagnostics={...prior,...(hasListingText?{listing_text:listingText}:{}),source_values:sourceValues,...(plan?{floorplan_measurements:plan.import_diagnostics.floorplan_measurements}:{}),outdoor_details:{version:outdoorVersion,listing_url:p.url,plan_fingerprint:planFingerprint(p),status:errors.length?'partial':'complete',checked_at:now,values,measurements:planItems,listing_measurements:source.measurements,dimensions_found:area!=null,errors}};
 return changes;
}
// This refresh owns measurements and their provenance. Every save
// compares the current entire row, including routes, owner comments and dates.
export async function refreshOutdoorProperty({sb,property,readListing,photo,loadListingPlan,recognize=readPlanImage}){
 const snapshot=structuredClone(property),measurements=[],errors=[];let listingText,listingData,sourcePlans=[];
 try{const source=await readListing(snapshot.url);if(!String(source?.listing_text||'').trim())throw Error('Full listing text unavailable');listingData=source;listingText=source.listing_text;sourcePlans=Array.isArray(source.floorplans)?source.floorplans:[]}
 catch(error){errors.push('Listing: '+String(error?.message||error))}
 for(const plan of snapshot.floorplans||[])try{
  const url=await photo(plan);if(!url||/\.pdf(?:\?|$)/i.test(plan.path||plan.url||url)){errors.push('Floor plan is not an image');continue}
  const response=await fetch(url);if(!response.ok)throw Error('Image download '+response.status);
  const recognized=await recognize(await response.blob());
  const text=[recognized.text,recognized.headerText,recognized.footerText].filter(Boolean).join('\n');
  if(!/\b(?:bedroom|kitchen|bathroom|ground\s+floor|internal\s+area)\b/i.test(text))throw Error('Floor plan text could not be read');
  measurements.push(parsePlanText(text,recognized));
 }catch(error){errors.push('Floor plan: '+String(error?.message||error))}
 // Old archives may contain a thumbnail with illegible measurements. Read the
 // larger current image verified by the original-listing importer as well.
 if(mainGardenArea(measurements.flatMap(x=>x.outdoor||[]))==null&&loadListingPlan&&!snapshot.manual_overrides?.floorplans&&!(snapshot.floorplans||[]).some(x=>/manual/i.test(x.path||''))){
  for(const url of sourcePlans.slice(0,4))try{const recognized=await recognize(await loadListingPlan(url));measurements.push(parsePlanText([recognized.text,recognized.headerText,recognized.footerText].filter(Boolean).join('\n'),recognized))}
  catch(error){errors.push('Original floor plan: '+String(error?.message||error))}
 }
 for(let attempt=0;attempt<2;attempt++){
  const fresh=await sb.from('properties').select('*').eq('id',snapshot.id).single();if(fresh.error)throw fresh.error;
  const current=fresh.data;if(!current||current.status==='deleted')return {status:'skipped',fields:[]};
  if(current.url!==snapshot.url||planFingerprint(current)!==planFingerprint(snapshot))return {status:'changed',fields:[]};
  const changes=outdoorChanges(current,{listingText,listingData,measurements,errors});
  const saved=await sb.rpc('house_hunt_save_manual_edit',{p_id:current.id,p_before:current,p_patch:changes});if(saved.error)throw saved.error;
  if(saved.data===true){Object.assign(property,current,changes);return {status:errors.length?'partial':'complete',fields:Object.keys(changes).filter(k=>k!=='import_diagnostics'),errors,dimensions:changes.import_diagnostics.outdoor_details.dimensions_found}}
 }
 return {status:'changed',fields:[]};
}
