import {validStreetViewHint,streetViewListingUrl} from './import-utils.js?v=4';
import {buildGoogleRouteUpdate} from './google-route-update.js?v=2';
import {selectGoogleStations} from './google-station-selection.js?v=2';

export function needsGoogleRouteResume(p){
 if(p.status==='deleted')return false;
 const d=p.import_diagnostics||{},s=d.source_location;
 if(d.route_pending===true)return true;
 return d.google_routes_version==='google-maps-ui-v1'&&(!s||s.address_input!==p.address||s.listing_url!==p.url||Number(s.latitude)!==Number(p.latitude)||Number(s.longitude)!==Number(p.longitude));
}
export async function functionError(result,label){
 let message=result.data?.error;
 if(!message&&result.error?.context){try{message=(await result.error.context.clone().json()).error}catch{}}
 return Error(label+': '+(message||result.error?.message||'missing response'));
}
function nextTuesday(){const now=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value])),day=new Date(parts.year+'-'+parts.month+'-'+parts.day+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+((2-day.getUTCDay()+7)%7||7));return day.toISOString().slice(0,10)}

// Every step is validated and saved for the same original-listing point. Failed
// steps remain pending; a retry resumes them and never discards completed routes.
export async function calculateGoogleRoutes(id,{sb,extension,progress=()=>{},onPointSaved=async()=>{},onSaved=onPointSaved,routingDate=nextTuesday(),delay=ms=>new Promise(r=>setTimeout(r,ms))}){
 async function read(){const r=await sb.from('properties').select('*').eq('id',id).single();if(r.error||!r.data)throw r.error||Error('House not found');if(r.data.status==='deleted')throw Error('House was deleted');return r.data}
 let p=await read();
 const d=p.import_diagnostics||{},completed=d.source_location;
 if(d.route_pending!==true&&d.google_routes_version==='google-maps-ui-v1'&&completed?.listing_url===p.url&&completed.address_input===p.address&&Number(completed.latitude)===Number(p.latitude)&&Number(completed.longitude)===Number(p.longitude))return {alreadyDone:true};
 let source=d.source_location;
 if(!(source?.source==='listing-street-view'&&source.listing_url===p.url&&source.address_input===p.address&&Number(source.latitude)===Number(p.latitude)&&Number(source.longitude)===Number(p.longitude))){
  progress('Reading the original listing map: '+p.address);
  const listing=await extension('IMPORT_URL',{url:streetViewListingUrl(p.url)},70000),hint=listing?.location_hint;
  if(!validStreetViewHint(hint,p.address))throw Error('Original listing did not provide a Street View point');
  source={source:'listing-street-view',listing_url:p.url,address_input:p.address,latitude:Number(hint.latitude),longitude:Number(hint.longitude),display_address:hint.address||null};
 }
 const latitude=Number(source.latitude),longitude=Number(source.longitude),origin={lat:latitude,lon:longitude},originKey=latitude+','+longitude;
 if((p.manual_overrides?.latitude&&Number(p.latitude)!==latitude)||(p.manual_overrides?.longitude&&Number(p.longitude)!==longitude))throw Error('A manually corrected location needs to be retained');
 if(p.latitude==null&&p.longitude==null){
  const oldDiagnostics=p.import_diagnostics,oldOverrides=p.manual_overrides;
  let save=sb.from('properties').update({latitude,longitude,import_diagnostics:{...(oldDiagnostics||{}),source_location:source,route_pending:true}}).eq('id',p.id).eq('url',p.url).eq('address',p.address).is('latitude',null).is('longitude',null);
  save=oldDiagnostics==null?save.is('import_diagnostics',null):save.eq('import_diagnostics',JSON.stringify(oldDiagnostics));
  save=oldOverrides==null?save.is('manual_overrides',null):save.eq('manual_overrides',JSON.stringify(oldOverrides));
  const saved=await save.select('*').maybeSingle();if(saved.error||!saved.data)throw saved.error||Error('House changed while its map point was being saved');p=saved.data;await onPointSaved();
 }
 const date=routingDate,old=p.import_diagnostics?.google_routes_work;
 const reusable=old?.version==='google-pipeline-v2'&&old.origin===originKey&&old.address===p.address&&old.listing_url===p.url;
 const work=reusable?structuredClone(old):{version:'google-pipeline-v2',job_id:crypto.randomUUID(),origin:originKey,address:p.address,listing_url:p.url,walks:{},google:{stations:[],journeys:{}}};
 if(work.date&&work.date!==date){work.google.journeys={};work.google.stations=(work.google.stations||[]).map(x=>x?{walking:x.walking}:null)}
 work.date=date;work.errors={};
 const google=work.google;
 async function save(visible=false){
  google.calculated_at=new Date().toISOString();
  for(let attempt=0;attempt<2;attempt++){
   const fresh=await read();
   if(fresh.url!==source.listing_url||fresh.address!==source.address_input)throw Error('House address changed during calculation');
   if((fresh.latitude!==p.latitude||fresh.longitude!==p.longitude)&&!(Number(fresh.latitude)===latitude&&Number(fresh.longitude)===longitude))throw Error('Map point changed during calculation');
   const patch=buildGoogleRouteUpdate(fresh,{latitude,longitude,source_location:source},work.preview,{...google,work},{partial:true});
   const result=await sb.rpc('house_hunt_save_google_routes',{p_id:id,p_before:fresh,p_patch:patch});
   if(result.error)throw result.error;
   if(result.data===true){p={...fresh,...patch};if(visible)try{await onSaved(p)}catch(error){console.warn('Saved route display unavailable',error)}return}
  }
  throw Error('House changed during calculation; the saved user data was retained');
 }
 async function route(kind,destination){await delay(250);const value=await extension('GOOGLE_ROUTE',{route:{kind,origin,...(destination?{destination}:{})}},130000);if(kind!=='station_walk'&&!value?.unavailable&&value?.date!==date)throw Error('Google returned a different timetable date');return {...value,calculated_at:new Date().toISOString()}}
 async function step(key,fn,visible=true){
  const before=structuredClone(google),beforePreview=work.preview;
  for(let attempt=0;attempt<2;attempt++){
   try{await fn();delete work.errors[key];await save(visible);return true}
   catch(error){for(const field of Object.keys(google))delete google[field];Object.assign(google,structuredClone(before));work.preview=beforePreview;work.errors[key]=String(error?.message||error);await save();if(work.errors[key].includes('GOOGLE_VERIFICATION_REQUIRED'))throw error;
    if(attempt===0&&/network|timeout|timed out|temporar|TfL (?:429|500|502|503|504)|route results unavailable/i.test(work.errors[key])){progress('Retrying '+key+': '+p.address);await delay(1200);continue}return false;
   }
  }
 }
 // These three routes do not need station discovery and must not be blocked by it.
 for(const kind of ['waterloo','dilly','dancelab']){
  if(google.journeys[kind])continue;
  progress('Reading Google Maps: '+p.address+' → '+kind);
  await step(kind,async()=>{google.journeys[kind]=await route(kind)});
 }
 async function loadStationMetadata(){
  const found=await sb.functions.invoke('house-hunt-station-commutes',{body:{id,preview:true,discover:true,metadata_only:true,latitude,longitude}});
  if(found.error||found.data?.error||!found.data?.metadata)throw await functionError(found,'Station discovery');
  work.metadata=found.data.metadata;
 }
 if(!work.metadata){
  progress('Finding station entrances: '+p.address);
  await step('station_discovery',loadStationMetadata,false);
 }
 if(work.metadata&&!work.preview){
  await step('station_walking',async()=>{
   for(let attempt=0;attempt<2;attempt++)try{
    const selected=await selectGoogleStations(work.metadata,{origin,walks:work.walks,route:async(destination,name)=>{progress('Reading Google Maps walking: '+p.address+' → '+name);return route('station_walk',destination)},onWalk:()=>save()});
    work.preview=selected.preview;google.stations=selected.stations;break;
   }catch(error){
    if(error.code!=='STATION_METADATA_RETRY'||attempt!==0)throw error;
    progress('Waiting for the station service, retaining saved Google routes: '+p.address);
    await delay(Math.min(60000,error.retry_after_ms||1200));await loadStationMetadata();await save();
   }
  });
 }
 if(work.preview){
  for(let i=0;i<3;i++){
   const stop=work.preview.tfl_final.results[i];if(!stop||google.stations[i]?.transit)continue;
   progress('Reading Google Maps transport: '+p.address+' → '+stop.name);
   await step('station_transit_'+i,async()=>{google.stations[i].transit=await route('station_transit',{lat:Number(stop.lat),lon:Number(stop.lon)})});
  }
 }
 await save(true);
 if(p.import_diagnostics.route_pending)throw Error(Object.entries(work.errors).map(([key,error])=>key+': '+error).join('; ')||'Some Google routes are not yet available');
 return {alreadyDone:false,address:p.address};
}
