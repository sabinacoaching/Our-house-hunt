// TfL supplies station identities and public entrances only. Google Maps supplies
// every distance and duration. Discovery must never depend on another router.
const cache=new Map<string,{until:number,value:Promise<any>}>();
let retryAfter=0;
const pause=(ms:number)=>new Promise(done=>setTimeout(done,ms));
const point=(p:any)=>p?.lat!=null&&p?.lon!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon));
const key=(s:string)=>String(s||'').toLowerCase().replace(/\b(?:railway|rail|national rail|train|station|stop)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const display=(s:string)=>String(s||'').replace(/\s+rail\s+station$/i,'').replace(/\s+underground\s+station$/i,' Underground').trim();
function metres(a:any,b:any){const r=Math.PI/180,dlat=(Number(b.lat)-a.lat)*r,dlon=(Number(b.lon)-a.lon)*r;return 12742000*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(Number(b.lat)*r)*Math.sin(dlon/2)**2))}
async function tfl(path:string){
 const saved=cache.get(path);if(saved&&saved.until>Date.now())return saved.value;
 const value=(async()=>{let last:any;for(let attempt=0;attempt<2;attempt++){
  try{
   if(retryAfter>Date.now())await pause(Math.min(60000,retryAfter-Date.now()));
   const response=await fetch('https://api.tfl.gov.uk'+path,{signal:AbortSignal.timeout(path.startsWith('/StopPoint?')?20000:10000),headers:{Accept:'application/json'}});
   if(!response.ok){
    if(response.status===429){
     const header=response.headers?.get('Retry-After'),seconds=header==null?NaN:Number(header),wait=Number.isFinite(seconds)?seconds*1000:header?Date.parse(header)-Date.now():60000;
     const ms=Math.max(1000,Math.min(60000,Number.isFinite(wait)?wait:60000));retryAfter=Math.max(retryAfter,Date.now()+ms);
     if(attempt===0)continue;
     const error:any=Error('TfL 429 at '+path.split('?')[0]);error.retry_after_ms=ms;throw error;
    }
    if(attempt===0&&[500,502,503,504].includes(response.status)){await pause(800);continue}throw Error('TfL '+response.status+' at '+path.split('?')[0]);
   }
   return await response.json();
  }catch(error){last=error;if(attempt===0)await pause(500)}
 }throw last||Error('TfL station metadata unavailable')})();
 cache.set(path,{until:Date.now()+86400000,value});
 try{return await value}catch(error){cache.delete(path);throw error}
}
async function mapLimited<T,R>(items:T[],fn:(item:T)=>Promise<R>){let next=0;const out:R[]=[];await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i])}}));return out}
function allEntrances(root:any,id:string):any[]{return (root.children||[]).flatMap((child:any)=>[
 ...(/Entrance$/i.test(child.stopType||'')&&child.status!==false&&point(child)&&(!child.stationNaptan||child.stationNaptan===id)?[{entrance_id:child.id,lat:Number(child.lat),lon:Number(child.lon)}]:[]),
 ...allEntrances(child,id)
])}
export async function discoverStationEntrances(origin:{lat:number,lon:number},property:any){
 const query=new URLSearchParams({lat:String(origin.lat),lon:String(origin.lon),stopTypes:'NaptanRailStation,NaptanMetroStation',radius:'4000',returnLines:'false'});
 const nearby=await tfl('/StopPoint?'+query),raw=(nearby.stopPoints||[]).filter((s:any)=>point(s)&&s.id&&!String(s.id).startsWith('HUB')&&s.modes?.some((m:string)=>['national-rail','overground','tube','tram','dlr','elizabeth-line'].includes(m)));
 const fields=['station_name','station_2_name','station_3_name'];
 const manual=Object.keys(property.station_commutes?.google_verified||{}).length>0;
 const requestedNames=fields.map(f=>property[f]&&(manual||property.manual_overrides?.[f])?String(property[f]).trim():null);
 const aliases=fields.map((field,i)=>{
  const choice=property.station_commutes?.manual_routes?.[field];
  return choice?.station_name===requestedNames[i]&&choice.destination?.station_id&&Number(choice.origin?.lat)===origin.lat&&Number(choice.origin?.lon)===origin.lon?choice.destination:null;
 });
 const protectedNames=requestedNames.map((name,i)=>aliases[i]?.name||name);
 for(const name of protectedNames.filter(Boolean)){
  if(raw.some((s:any)=>key(display(s.commonName))===key(name)))continue;
  const search=await tfl('/StopPoint/Search/'+encodeURIComponent(String(name).replace(/\s+Underground$/i,''))+'?modes=national-rail,overground,tube,tram,dlr');
  const match=(search.matches||[]).filter((s:any)=>point(s)&&key(display(s.name))===key(name)&&metres(origin,s)<8000).sort((a:any,b:any)=>metres(origin,a)-metres(origin,b))[0];
  if(match)raw.push({...match,commonName:match.name});
 }
 const unique=[...new Map(raw.map((s:any)=>[s.id,s])).values()].sort((a:any,b:any)=>metres(origin,a)-metres(origin,b));
 const errors:any[]=[];
 const found=await mapLimited(unique,async(stop:any)=>{
  try{
   let details=await tfl('/StopPoint/'+encodeURIComponent(stop.id));
   if(String(details.id||stop.id).startsWith('HUB')){
    const mode=String(stop.commonName).match(/underground/i)?'tube':String(stop.commonName).match(/tram/i)?'tram':'national-rail';
    details=(details.children||[]).find((s:any)=>s.modes?.includes(mode)&&key(display(s.commonName))===key(display(stop.commonName)));
   }
   if(!details?.id||!point(details))throw Error('Station identity unavailable');
   const entrances=allEntrances(details,details.id);
   if(!entrances.length&&details.modes?.includes('tram'))entrances.push({entrance_id:details.id,lat:Number(details.lat),lon:Number(details.lon)});
   if(!entrances.length)throw Error('No public entrance in TfL station metadata');
   return {name:display(details.commonName||stop.commonName),station_id:details.id,entrances:[...new Map(entrances.map(e=>[e.entrance_id,e])).values()]};
  }catch(error:any){errors.push({station_id:stop.id,name:display(stop.commonName),lat:stop.lat,lon:stop.lon,error:String(error),retryable:/TfL (?:429|5\d\d)|timeout|timed out|fetch failed|network/i.test(String(error)),retry_after_ms:error.retry_after_ms||null});return null}
 });
 const candidates=found.filter(Boolean);
 if(!candidates.length)throw Error('No station entrances found: '+errors.map(e=>e.error).join('; '));
 for(const name of protectedNames.filter(Boolean))if(!candidates.some((s:any)=>key(s.name)===key(name)))throw Error('Manually selected station entrance unavailable: '+name);
 for(let i=0;i<aliases.length;i++)if(aliases[i]){
  const station=candidates.find((candidate:any)=>candidate.station_id===aliases[i].station_id);
  if(station){station.routing_name=station.name;station.name=requestedNames[i]}
 }
 return {version:'tfl-entrances-v1',origin:origin.lat+','+origin.lon,candidates,protected_names:requestedNames,errors,source:'TfL StopPoint public entrance metadata'};
}
