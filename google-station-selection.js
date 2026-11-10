const normalized=s=>String(s||'').toLowerCase().replace(/\b(?:railway|rail|train|station|stop)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function straight(a,b){const r=Math.PI/180,dy=(Number(b.lat)-a.lat)*r,dx=(Number(b.lon)-a.lon)*r;return 12742000*Math.asin(Math.sqrt(Math.sin(dy/2)**2+Math.cos(a.lat*r)*Math.cos(Number(b.lat)*r)*Math.sin(dx/2)**2))}
export function stationTransportType(stop){
 const modes=stop.modes||[],id=String(stop.station_id||''),name=String(stop.name||'');
 if(modes.some(x=>['national-rail','overground','elizabeth-line'].includes(x))||/^910G/.test(id))return 'rail';
 if(stop.transport_type)return stop.transport_type;
 if(modes.includes('tram')||/tram/i.test(name)||/^940GZZCR/.test(id))return 'tram';
 if(modes.some(x=>['tube','dlr'].includes(x))||/underground|tube|metro/i.test(name)||/^940GZZ(?:LU|DL)/.test(id))return 'tube';
 return 'rail';
}
export function namedStationQuery(stop){
 const type=stationTransportType(stop),name=String(stop.routing_name||stop.name||'').replace(/\s+(?:railway|rail|train)?\s*station$/i,'').replace(/\s+(?:underground|tram stop)$/i,'').trim();
 return name+(type==='rail'?' train station':type==='tube'?' Underground Station, London, UK':' Tram Stop, London, UK');
}
// Rail and Tube are compared by actual Google walking time. Rail wins a tie;
// trams fill a slot only when fewer than three eligible rail/Tube stations exist.
export async function selectGoogleStations(metadata,{origin,walks={},route,onWalk=async()=>{}}){
 const originKey=origin.lat+','+origin.lon;
 if(metadata?.origin!==originKey||!metadata.candidates?.length)throw Error('Station metadata belongs to a different map point');
 const required=metadata.protected_names||[null,null,null];
 const candidates=metadata.candidates.map(stop=>({...stop,transport_type:stationTransportType(stop)}));
 const nonTram=candidates.filter(s=>s.transport_type!=='tram'),includeTrams=nonTram.length<3;
 const eligible=candidates.filter(s=>s.transport_type!=='tram'||includeTrams||required.some(name=>name&&normalized(name)===normalized(s.name)));
 const best=new Map(),failures=[];
 const entrances=eligible.flatMap(stop=>(stop.named_query?(stop.entrances||[]).slice(0,1):(stop.entrances||[])).map(e=>({stop,...e,lower:straight(origin,e),key:(stop.named_query?'named-v1:':'')+stop.station_id+':'+e.entrance_id}))).sort((a,b)=>Number(a.stop.transport_type==='tram')-Number(b.stop.transport_type==='tram')||a.lower-b.lower);
 const compare=(a,b)=>Number(a.stop.transport_type==='tram')-Number(b.stop.transport_type==='tram')||a.walking.walking_minutes-b.walking.walking_minutes||a.walking.walking_miles-b.walking.walking_miles||Number(a.stop.transport_type==='tube')-Number(b.stop.transport_type==='tube')||a.stop.name.localeCompare(b.stop.name);
 const choose=()=>{
  const all=[...best.values()].sort(compare),used=new Set();
  const chosen=required.map(name=>{if(!name)return null;const found=all.find(x=>normalized(x.stop.name)===normalized(name));if(found){used.add(found.stop.station_id);return {...found,name}}return null});
  for(let i=0;i<3;i++)if(!chosen[i]&&!required[i]){const next=all.find(x=>!used.has(x.stop.station_id));if(next){used.add(next.stop.station_id);chosen[i]={...next,name:next.stop.name}}}
  return chosen;
 };
 for(const e of entrances){
  const chosen=choose(),available=chosen.filter(Boolean),count=Math.min(3,eligible.length),requiredReady=required.every((name,i)=>!name||chosen[i]);
  if(!e.stop.named_query&&available.length>=count&&requiredReady&&e.lower>Math.max(...available.map(x=>x.walking.walking_miles*1609.344))+120)break;
  try{
   let walking=walks[e.key];
   const destination=e.stop.named_query?{lat:Number(e.lat),lon:Number(e.lon),name:e.stop.name,station_id:e.stop.station_id,transport_type:e.stop.transport_type,query:namedStationQuery(e.stop)}:{lat:Number(e.lat),lon:Number(e.lon)};
   const expected=destination.query||e.lat+','+e.lon;
   if(!walking){walking=await route(destination,e.stop.name);walks[e.key]=walking;await onWalk()}
   if(walking.source!=='Google Maps'||walking.origin!==originKey||walking.destination!==expected||e.stop.named_query&&walking.station_id!==e.stop.station_id||!(Number(walking.walking_miles)>0)||!(Number(walking.walking_minutes)>0))throw Error('Invalid Google walking route to '+e.stop.name);
   const current=best.get(e.stop.station_id);if(!current||walking.walking_minutes<current.walking.walking_minutes)best.set(e.stop.station_id,{stop:e.stop,entrance:e,walking,destination:expected});
  }catch(error){if(String(error?.message||error).includes('GOOGLE_VERIFICATION_REQUIRED'))throw error;failures.push({lower:e.lower,error:String(error?.message||error)})}
 }
 const chosen=choose();if(!chosen.some(Boolean))throw Error('No Google walking routes to station entrances: '+failures.map(x=>x.error).join('; '));
 if(required.some((name,i)=>name&&!chosen[i]))throw Error('A manually selected station could not be routed');
 const limit=Math.max(...chosen.filter(Boolean).map(x=>x.walking.walking_miles*1609.344))+120;
 if(failures.some(x=>x.lower<=limit))throw Error('A potentially nearer station could not be checked: '+failures.filter(x=>x.lower<=limit).map(x=>x.error).join('; '));
 const missing=(metadata.errors||[]).filter(x=>(includeTrams||stationTransportType(x)!=='tram')&&x.lat!=null&&x.lon!=null&&straight(origin,x)<=limit&&(x.retryable===true||/TfL (?:429|5\d\d)|timeout|timed out|fetch failed|network/i.test(x.error||'')));
 if(missing.length){const error=Error('Station metadata temporarily unavailable: '+missing.map(x=>x.error).join('; '));error.code='STATION_METADATA_RETRY';error.retry_after_ms=Math.max(1200,...missing.map(x=>Number(x.retry_after_ms)||0));throw error}
 const names=chosen.map(x=>x?.name||'');
 return {preview:{tfl_final:{complete:true,origin:originKey,names,results:chosen.map(x=>x?{name:x.name,station_id:x.stop.station_id,entrance_id:x.entrance.entrance_id,lat:Number(x.entrance.lat),lon:Number(x.entrance.lon),transport_type:x.stop.transport_type,...(x.stop.named_query?{destination:x.destination,destination_mode:'named-station',reference_point_source:'TfL; Google chooses the public station entrance'}:{})}:null),source:'TfL station identities; named Google Maps station walking selection'}},stations:chosen.map(x=>x?{walking:x.walking}:null)};
}
