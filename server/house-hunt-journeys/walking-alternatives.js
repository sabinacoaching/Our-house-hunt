// Combine public timetable legs with independently routed walking legs.
// Never shift a scheduled train or bus: only the departure from the house and
// the final arrival may move when a walking route is substituted.
const point=p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))?{lat:Number(p.lat),lon:Number(p.lon)}:null;
const wall=s=>{
 if(typeof s!=='string')return NaN;
 if(!/(?:Z|[+-]\d\d:\d\d)$/.test(s))return Date.parse(s+'Z');
 const ms=Date.parse(s);if(!Number.isFinite(ms))return NaN;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
};
const fmt=ms=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'');
const minutes=n=>Math.max(1,Math.round(Number(n)/60));
const near=(a,b)=>{if(!a||!b)return false;const y=(a.lat-b.lat)*111195,x=(a.lon-b.lon)*111195*Math.cos(a.lat*Math.PI/180);return Math.hypot(x,y)<=40};
export async function walkingAlternatives({fetchFn,origin,destination,date,deadline,journeys}){
 const cache=new Map();
 async function foot(from,to){
  from=point(from);to=point(to);if(!from||!to)return null;
  const key=`${from.lon},${from.lat};${to.lon},${to.lat}`;
  if(!cache.has(key))cache.set(key,(async()=>{try{
   const response=await fetchFn(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${key}?overview=false`,{signal:AbortSignal.timeout(12000)});
   if(!response.ok)return null;const data=await response.json(),route=data.routes?.[0];
   if(data.code!=='Ok'||!Number.isFinite(route?.duration)||route.duration<=0||!Number.isFinite(route?.distance)||route.distance<=0||data.waypoints?.some(p=>p.distance>40))return null;
   return {minutes:minutes(route.duration),distance:route.distance};
  }catch{return null}})());
  return cache.get(key);
 }
 async function adjust(j,appendWalk=null){
  const legs=j.legs||[],first=legs[0],last=legs.at(-1);
  if(!legs.some(l=>l.mode?.id&&!['walking','cycle'].includes(l.mode.id)))return null;
  let start=wall(j.startDateTime),end=wall(j.arrivalDateTime);if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  let changed=false,newLegs=legs.slice();
  if(first?.mode?.id==='walking'&&near(point(first.departurePoint),origin)){
   const route=await foot(first.departurePoint,first.arrivalPoint),legEnd=wall(first.arrivalTime);
   if(route&&Number.isFinite(legEnd)){start=legEnd-route.minutes*60000;newLegs[0]={...first,duration:route.minutes,departureTime:fmt(start),walking_source:'OpenStreetMap'};changed=true}
  }
  if(appendWalk){end+=appendWalk.minutes*60000;newLegs.push({mode:{id:'walking'},departurePoint:last.arrivalPoint,arrivalPoint:destination,duration:appendWalk.minutes,walking_source:'OpenStreetMap'});changed=true}
  else if(last?.mode?.id==='walking'&&near(point(last.arrivalPoint),point(destination))){
   const route=await foot(last.departurePoint,last.arrivalPoint),legStart=wall(last.departureTime);
   if(route&&Number.isFinite(legStart)){end=legStart+route.minutes*60000;newLegs[newLegs.length-1]={...last,duration:route.minutes,arrivalTime:fmt(end),walking_source:'OpenStreetMap'};changed=true}
  }
  if(!changed||end<=start)return null;
  return {...j,startDateTime:fmt(start),arrivalDateTime:fmt(end),duration:Math.round((end-start)/60000),legs:newLegs,walking_adjusted:true};
 }
 const out=(await Promise.all(journeys.map(j=>adjust(j)))).filter(Boolean);
 try{
  const params=new URLSearchParams({lat:String(destination.lat),lon:String(destination.lon),stopTypes:'NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation',radius:'250'});
  const response=await fetchFn('https://api.tfl.gov.uk/StopPoint?'+params,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)return out;
  const data=await response.json(),stops=(data.stopPoints||[]).filter(s=>s.id&&point(s)).sort((a,b)=>Number(a.distance)-Number(b.distance)).slice(0,4);
  const results=await Promise.all(stops.map(async stop=>{try{
   const walk=await foot(stop,destination);if(!walk||walk.minutes>10)return [];
   const by=new Date(deadline-walk.minutes*60000),time=String(by.getUTCHours()).padStart(2,'0')+String(by.getUTCMinutes()).padStart(2,'0');
   const url=`https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(origin.lat+','+origin.lon)}/to/${encodeURIComponent(stop.id)}?`+new URLSearchParams({date,time,timeIs:'arriving',journeyPreference:'leasttime',alternative:'true'});
   const r=await fetchFn(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)return [];
   const raw=await r.json();
   const usable=(raw.journeys||[]).filter(j=>{const legs=j.legs||[];return near(point(legs[0]?.departurePoint),origin)&&near(point(legs.at(-1)?.arrivalPoint),point(stop))});
   return (await Promise.all(usable.map(j=>adjust(j,walk)))).filter(Boolean);
  }catch{return []}}));
  out.push(...results.flat());
 }catch{}
 return out;
}
