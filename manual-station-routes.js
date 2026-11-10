import {stationFields,stationDistanceFields,stationContext,sameStationContext,pendingStationChoices,stationIdentity} from './station-choice-state.js?v=1';
import {stationTransportType,namedStationQuery} from './google-station-selection.js?v=4';
import {validStreetViewHint,streetViewListingUrl} from './import-utils.js?v=4';

const stationBase=name=>stationIdentity(name).replace(/\b(?:underground|tube|tram|overground)\b/g,'').replace(/\s+/g,' ').trim();
const point=value=>value?.lat!=null&&value?.lon!=null&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lon));
const distance=(a,b)=>Math.pow(Number(a.lat)-Number(b.lat),2)+Math.pow((Number(a.lon)-Number(b.lon))*Math.cos(Number(a.lat)*Math.PI/180),2);
export async function resolveManualStation(p,name,origin,{fetcher=fetch}={}){
 const requested=/tram/i.test(name)?'tram':/underground|tube/i.test(name)?'tube':/\b(?:rail|railway|train)\b/i.test(name)?'rail':null;
 const match=stop=>stationBase(stop.routing_name||stop.name)===stationBase(name)&&(!requested||stationTransportType(stop)===requested);
 const cached=[...(p.import_diagnostics?.google_routes_work?.metadata?.candidates||[]),...(p.station_commutes?.tfl_final?.results||[])].filter(Boolean).filter(match);
 let candidates=cached;
 if(!candidates.length){
  const query=String(name).replace(/\b(?:railway|rail|train|station|stop|underground|tube|tram)\b/gi,' ').replace(/\s+/g,' ').trim();
  const response=await fetcher('https://api.tfl.gov.uk/StopPoint/Search/'+encodeURIComponent(query)+'?modes=national-rail,overground,tube,tram,dlr,elizabeth-line',{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Station lookup: TfL '+response.status);
  const found=await response.json(),raw=found.matches||[],expanded=[];
  for(const stop of raw){
   if(!String(stop.id||'').startsWith('HUB')){expanded.push(stop);continue}
   const details=await fetcher('https://api.tfl.gov.uk/StopPoint/'+encodeURIComponent(stop.id),{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
   if(!details.ok)throw Error('Station lookup: TfL '+details.status);
   const hub=await details.json();expanded.push(...(hub.children||[]));
  }
  candidates=expanded.map(stop=>({...stop,name:stop.commonName||stop.name,station_id:stop.id})).filter(stop=>/^910G|^940GZZ(?:LU|CR|DL)/.test(String(stop.station_id))&&point(stop)&&match(stop));
 }
 const rank=stop=>({rail:0,tube:1,tram:2}[stationTransportType(stop)]??3);
 candidates.sort((a,b)=>rank(a)-rank(b)||distance(origin,a.entrances?.[0]||a)-distance(origin,b.entrances?.[0]||b));
 const stop=candidates[0];if(!stop)throw Error('Station not found: '+name);
 const location=stop.entrances?.[0]||stop,canonical={...stop,name:stop.routing_name||stop.name};
 if(!point(location))throw Error('Station location unavailable: '+name);
 return {lat:Number(location.lat),lon:Number(location.lon),station_id:stop.station_id,name:canonical.name,transport_type:stationTransportType(stop),query:namedStationQuery(canonical)};
}

async function originFor(p,extension){
 const source=p.import_diagnostics?.source_location;
 if(source?.source==='listing-street-view'&&source.listing_url===p.url&&source.address_input===p.address&&p.latitude!=null&&p.longitude!=null&&Number(source.latitude)===Number(p.latitude)&&Number(source.longitude)===Number(p.longitude))return {lat:Number(p.latitude),lon:Number(p.longitude),source:'listing-street-view'};
 if((p.manual_overrides?.latitude||p.manual_overrides?.longitude)&&p.latitude!=null&&p.longitude!=null){
  const lat=Number(p.latitude),lon=Number(p.longitude);if(!(lat>49&&lat<61&&lon> -9&&lon<3))throw Error('The manually entered house location is invalid');
  return {lat,lon,source:'manual-location'};
 }
 const listing=await extension('IMPORT_URL',{url:streetViewListingUrl(p.url)},70000),hint=listing?.location_hint;
 if(!validStreetViewHint(hint,p.address))throw Error('Original listing did not provide a Street View point');
 return {lat:Number(hint.latitude),lon:Number(hint.longitude),source:'listing-street-view'};
}
const json=value=>JSON.stringify(value);
const superseded=()=>Object.assign(Error('Station choice or house location changed during calculation'),{code:'STATION_CHOICE_CHANGED'});

// This worker owns only explicitly changed station slots. It never discovers or
// replaces the other slots, nor recalculates Waterloo, The Dilly or Dance Lab.
export async function calculateManualStationRoutes(id,{sb,extension,progress=()=>{},onSaved=()=>{},resolveStation=resolveManualStation,delay=ms=>new Promise(done=>setTimeout(done,ms))}){
 async function read(){const result=await sb.from('properties').select('*').eq('id',id).single();if(result.error||!result.data)throw result.error||Error('House not found');return result.data}
 const attempted=new Set(),failures=[];let savedCount=0;
 for(;;){
  const p=await read(),context=stationContext(p),job=pendingStationChoices(p).find(entry=>!attempted.has(entry.request_id+json(context)));
  if(!job)break;attempted.add(job.request_id+json(context));
  async function save(update){
   for(let attempt=0;attempt<3;attempt++){
    const fresh=await read(),current=fresh.station_commutes?.manual_routes?.[job.field];
    if(fresh.status==='deleted'||String(fresh[job.field]||'').trim()!==job.station_name||current?.request_id!==job.request_id||!sameStationContext(stationContext(fresh),context))throw superseded();
    const entry={...structuredClone(current),context},patch=update(entry,fresh);
    const commutes={...(fresh.station_commutes||{}),manual_routes:{...(fresh.station_commutes?.manual_routes||{}),[job.field]:entry}};
    let query=sb.from('properties').update({...patch,station_commutes:commutes}).eq('id',id).eq(job.field,fresh[job.field]);
    for(const field of ['address','url','latitude','longitude','status','station_commutes','manual_overrides'])query=fresh[field]==null?query.is(field,null):query.eq(field,typeof fresh[field]==='object'?json(fresh[field]):fresh[field]);
    const result=await query.select('*').maybeSingle();if(result.error)throw result.error;
    if(result.data){try{await onSaved(result.data)}catch(error){console.warn('Saved station display unavailable',error)}return result.data}
   }
   throw Error('House was edited during calculation; Refresh will retry this station');
  }
  try{
   let choice=sameStationContext(job.context,context)?job:null;
   if(!choice?.origin||!choice?.destination){
    progress('Checking station: '+p.address+' → '+job.station_name);
    const origin=await originFor(p,extension),destination=await resolveStation(p,job.station_name,origin);
    const saved=await save(entry=>{Object.assign(entry,{origin,destination,walking:null,transit:null,state:'pending',error:null});return {}});
    choice=saved.station_commutes.manual_routes[job.field];
   }
   const {origin,destination}=choice,originKey=origin.lat+','+origin.lon;
   async function route(kind){
    let last;
    for(let attempt=0;attempt<2;attempt++)try{
     const requestedDestination={...destination,name:destination.name.replace(/\s+tram\s+stop$/i,'')};
     await delay(250);const value=await extension('GOOGLE_ROUTE',{route:{kind,origin:{lat:origin.lat,lon:origin.lon},destination:requestedDestination}},130000);
     if(value?.source!=='Google Maps'||value.origin!==originKey||value.destination!==destination.query||value.station_id!==destination.station_id)throw Error('Google station route did not match the selected station');
     if(kind==='station_walk'&&(!(Number(value.walking_minutes)>0)||!(Number(value.walking_miles)>0)))throw Error('Google walking route is incomplete');
     if(kind==='station_transit'&&!value.unavailable&&(!(Number(value.minutes)>0)||!/^\d{4}-\d{2}-\d{2}$/.test(value.date||'')))throw Error('Google transport route is incomplete');
     return {...value,calculated_at:new Date().toISOString()};
    }catch(error){last=error;if(attempt||!/network|timeout|timed out|temporar|route results unavailable/i.test(String(error?.message||error)))throw error;await delay(1200)}
    throw last;
   }
   if(!choice.walking){
    progress('Reading Google Maps walking: '+p.address+' → '+job.station_name);
    const walking=await route('station_walk');
    const saved=await save((entry,fresh)=>{entry.walking=walking;entry.error=null;return fresh.manual_overrides?.[stationDistanceFields[job.index]]?{}:{[stationDistanceFields[job.index]]:walking.walking_miles}});
    choice=saved.station_commutes.manual_routes[job.field];
   }
   if(!choice.transit){
    progress('Reading Google Maps transport: '+p.address+' → '+job.station_name);
    const transit=await route('station_transit');
    await save(entry=>{entry.transit=transit;entry.state='complete';entry.error=null;entry.completed_at=new Date().toISOString();return {}});
   }else if(choice.state!=='complete')await save(entry=>{entry.state='complete';entry.error=null;return {}});
   savedCount++;
  }catch(error){
   if(error?.code==='STATION_CHOICE_CHANGED')continue;
   const message=String(error?.message||error);
   try{await save(entry=>{entry.state='pending';entry.error=message;return {}})}catch(changed){if(changed?.code==='STATION_CHOICE_CHANGED')continue;throw changed}
   failures.push(job.station_name+': '+message);
   if(message.includes('GOOGLE_VERIFICATION_REQUIRED'))break;
  }
 }
 if(failures.length)throw Error(failures.join('; '));
 return {saved:savedCount};
}
