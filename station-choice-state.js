export const stationFields=['station_name','station_2_name','station_3_name'];
export const stationDistanceFields=['station_distance_miles','station_2_distance_miles','station_3_distance_miles'];
export const stationIdentity=name=>String(name||'').toLowerCase().replace(/\([^)]*\)/g,'').replace(/\b(?:railway|rail|train|station|stop)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export const stationContext=p=>({address:p.address,url:p.url,latitude:p.latitude??null,longitude:p.longitude??null});
export const sameStationContext=(a,b)=>!!a&&!!b&&['address','url','latitude','longitude'].every(key=>a[key]===b[key]||(a[key]==null&&b[key]==null));
export function stationChoice(p,index){
 const choice=p.station_commutes?.manual_routes?.[stationFields[index]];
 return choice&&choice.station_name===String(p[stationFields[index]]||'').trim()&&sameStationContext(choice.context,stationContext(p))?choice:null;
}
export function pendingStationChoices(p){
 if(p.status==='deleted')return [];
 return stationFields.flatMap((field,index)=>{
  const entry=p.station_commutes?.manual_routes?.[field];
  return entry&&entry.state!=='complete'&&entry.station_name&&entry.station_name===String(p[field]||'').trim()?[{field,index,...entry}]:[];
 });
}
export const hasPendingStationChoices=p=>pendingStationChoices(p).length>0;
export function changedStationNames(p,changes){
 return stationFields.filter(field=>Object.hasOwn(changes,field)&&String(changes[field]||'').trim()!==String(p[field]||'').trim());
}
export function prepareStationChanges(p,changes,{requestId=()=>crypto.randomUUID(),now=()=>new Date().toISOString()}={}){
 const fields=changedStationNames(p,changes);if(!fields.length)return changes;
 const patch={...changes},commutes=structuredClone(changes.station_commutes||p.station_commutes||{}),overrides={...(changes.manual_overrides||p.manual_overrides||{})};
 commutes.manual_routes={...(commutes.manual_routes||{})};
 for(const field of fields){
  const index=stationFields.indexOf(field),distance=stationDistanceFields[index],name=String(changes[field]||'').trim(),oldName=String(p[field]||'').trim(),old=commutes.manual_routes[field];
  patch[field]=name;overrides[field]=true;
  const explicitDistance=Object.hasOwn(changes,distance)&&String(changes[distance]??'')!==String(p[distance]??'');
  const previousCorrection=old?.previous?.name===name&&old.previous.manual_distance===true;
  if(!explicitDistance&&stationIdentity(name)!==stationIdentity(oldName)){
   patch[distance]=previousCorrection?old.previous.distance:null;
   if(previousCorrection)overrides[distance]=true;else delete overrides[distance];
  }
  if(!name){delete commutes.manual_routes[field];continue}
  commutes.manual_routes[field]={request_id:requestId(),station_name:name,state:'pending',requested_at:now(),context:stationContext({...p,...patch}),previous:{name:oldName,distance:p[distance]??null,manual_distance:p.manual_overrides?.[distance]===true}};
 }
 patch.manual_overrides=overrides;patch.station_commutes=commutes;
 // A later full import must discover entrances for the owner's new choices.
 // Keep checked walks and destination journeys, but invalidate station selection.
 if(p.import_diagnostics?.google_routes_work){
  const diagnostics=structuredClone(p.import_diagnostics),work=diagnostics.google_routes_work;
  delete work.metadata;delete work.preview;
  if(work.google)work.google.stations=[];
  patch.import_diagnostics=diagnostics;
 }
 return patch;
}
