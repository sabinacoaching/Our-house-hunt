const normalized=s=>String(s||'').toLowerCase().replace(/\b(?:railway|rail|train|station|stop)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function straight(a,b){const r=Math.PI/180,dy=(Number(b.lat)-a.lat)*r,dx=(Number(b.lon)-a.lon)*r;return 12742000*Math.asin(Math.sqrt(Math.sin(dy/2)**2+Math.cos(a.lat*r)*Math.cos(Number(b.lat)*r)*Math.sin(dx/2)**2))}
// Straight-line distance is only a lower bound to avoid unnecessary Google
// requests. The selected stations and all saved values use actual walking routes.
export async function selectGoogleStations(metadata,{origin,walks={},route,onWalk=async()=>{}}){
 const originKey=origin.lat+','+origin.lon;
 if(metadata?.origin!==originKey||!metadata.candidates?.length)throw Error('Station metadata belongs to a different map point');
 const candidates=metadata.candidates,required=metadata.protected_names||[null,null,null],best=new Map(),failures=[];
 const entrances=candidates.flatMap(stop=>(stop.entrances||[]).map(e=>({stop,...e,lower:straight(origin,e),key:stop.station_id+':'+e.entrance_id}))).sort((a,b)=>a.lower-b.lower);
 const choose=()=>{
  const all=[...best.values()].sort((a,b)=>a.walking.walking_miles-b.walking.walking_miles||a.stop.name.localeCompare(b.stop.name)),used=new Set();
  const chosen=required.map(name=>{if(!name)return null;const found=all.find(x=>normalized(x.stop.name)===normalized(name));if(found){used.add(found.stop.station_id);return {...found,name}}return null});
  for(let i=0;i<3;i++)if(!chosen[i]&&!required[i]){const next=all.find(x=>!used.has(x.stop.station_id));if(next){used.add(next.stop.station_id);chosen[i]={...next,name:next.stop.name}}}
  return chosen;
 };
 for(const e of entrances){
  const chosen=choose(),available=chosen.filter(Boolean),count=Math.min(3,candidates.length),requiredReady=required.every((name,i)=>!name||chosen[i]);
  // Google rounds displayed distances. 120 m covers the display rounding so
  // a candidate cannot be skipped merely because two rounded values tie.
  if(available.length>=count&&requiredReady&&e.lower>Math.max(...available.map(x=>x.walking.walking_miles*1609.344))+120)break;
  try{
   let walking=walks[e.key];
   if(!walking){walking=await route({lat:Number(e.lat),lon:Number(e.lon)},e.stop.name);walks[e.key]=walking;await onWalk()}
   if(walking.source!=='Google Maps'||walking.origin!==originKey||walking.destination!==e.lat+','+e.lon||!(Number(walking.walking_miles)>0)||!(Number(walking.walking_minutes)>0))throw Error('Invalid Google walking route to '+e.stop.name);
   const current=best.get(e.stop.station_id);if(!current||walking.walking_miles<current.walking.walking_miles)best.set(e.stop.station_id,{stop:e.stop,entrance:e,walking});
  }catch(error){if(String(error?.message||error).includes('GOOGLE_VERIFICATION_REQUIRED'))throw error;failures.push({lower:e.lower,error:String(error?.message||error)})}
 }
 const chosen=choose();if(!chosen.some(Boolean))throw Error('No Google walking routes to station entrances: '+failures.map(x=>x.error).join('; '));
 if(required.some((name,i)=>name&&!chosen[i]))throw Error('A manually selected station could not be routed');
 const limit=Math.max(...chosen.filter(Boolean).map(x=>x.walking.walking_miles*1609.344))+120;
 if(failures.some(x=>x.lower<=limit))throw Error('A potentially nearer station could not be checked: '+failures.filter(x=>x.lower<=limit).map(x=>x.error).join('; '));
 const missing=(metadata.errors||[]).filter(x=>x.lat!=null&&x.lon!=null&&straight(origin,x)<=limit&&(x.retryable===true||/TfL (?:429|5\d\d)|timeout|timed out|fetch failed|network/i.test(x.error||'')));
 if(missing.length){const error=Error('Station metadata temporarily unavailable: '+missing.map(x=>x.error).join('; '));error.code='STATION_METADATA_RETRY';error.retry_after_ms=Math.max(1200,...missing.map(x=>Number(x.retry_after_ms)||0));throw error}
 const names=chosen.map(x=>x?.name||'');
 return {preview:{tfl_final:{complete:true,origin:originKey,names,results:chosen.map(x=>x?{name:x.name,station_id:x.stop.station_id,entrance_id:x.entrance.entrance_id,lat:Number(x.entrance.lat),lon:Number(x.entrance.lon)}:null),source:'TfL station entrances; Google Maps walking selection'}},stations:chosen.map(x=>x?{walking:x.walking}:null)};
}
