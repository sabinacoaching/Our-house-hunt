import {createClient} from "npm:@supabase/supabase-js@2.49.8";
const root=Deno.env.get("SUPABASE_URL")!;
const admin=createClient(root,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"https://sabinacoaching.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"}});
const times=["0730"];
const distance=(a:any,b:any)=>{
 const rad=Math.PI/180,dy=(Number(b.lat)-a.lat)*rad,dx=(Number(b.lon)-a.lon)*rad;
 const z=Math.sin(dy/2)**2+Math.cos(a.lat*rad)*Math.cos(Number(b.lat)*rad)*Math.sin(dx/2)**2;
 return 12742000*Math.asin(Math.sqrt(z));
};
const normal=(s:string)=>String(s||"").toLowerCase().replace(/\b(?:rail|underground|national rail|train|station|stop|tram|overground)\b/g,"").replace(/[^a-z0-9]+/g," ").trim();
function tuesday(){
 const dt=new Date(),day=dt.getUTCDay(),delta=(2-day+7)%7||7;
 return new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()+delta)).toISOString().slice(0,10).replaceAll("-","");
}
async function findStation(name:string,origin:{lat:number,lon:number}){
 const lookup=name.replace(/\b(?:rail station|underground station|tram stop|rail|underground|station)\b/ig,"").trim();
 const u="https://api.tfl.gov.uk/StopPoint/Search/"+encodeURIComponent(lookup)+"?"+new URLSearchParams({modes:"national-rail,overground,tube,tram,dlr"});
 const res=await fetch(u,{signal:AbortSignal.timeout(15000),headers:{"Accept":"application/json"}});
 if(!res.ok)throw Error("TfL station lookup "+res.status);
 const data=await res.json();
 const list=(data.matches||[]).filter((m:any)=>Number.isFinite(Number(m.lat))&&Number.isFinite(Number(m.lon)));
 const target=normal(name);
 const scored=list.map((m:any)=>{
  const base=normal(m.name),km=distance(origin,m)/1000;
  const exact=base===target,similar=base.includes(target)||target.includes(base);
  let penalty=exact?0:similar?10:60;
  if(/underground/i.test(name)&&!m.modes?.includes("tube"))penalty+=30;
  if(/tram/i.test(name)&&!m.modes?.includes("tram"))penalty+=30;
  if(!/underground|tram/i.test(name)&&m.modes?.includes("tube")&&!m.modes?.includes("national-rail"))penalty+=10;
  return {...m,km,score:penalty+km*2};
 }).sort((a:any,b:any)=>a.score-b.score);
 let chosen=scored[0],stationDetails:any=null;
 if(!chosen||chosen.km>8||chosen.score>35)throw Error("Station could not be matched accurately");
 // Search often returns a transport hub whose centroid is neither its rail
 // entrance nor its tram stop. Resolve the child matching the requested mode.
 const wantedMode=/tram/i.test(name)?"tram":/underground|tube/i.test(name)?"tube":"national-rail";
 if(String(chosen.id||"").startsWith("HUB")){
  const details=await fetch("https://api.tfl.gov.uk/StopPoint/"+encodeURIComponent(chosen.id),{signal:AbortSignal.timeout(15000),headers:{"Accept":"application/json"}});
  if(!details.ok)throw Error("TfL station details "+details.status);
  const hub=await details.json();
  const candidates=(hub.children||[]).filter((child:any)=>child.modes?.includes(wantedMode)&&child.lat!=null&&child.lon!=null&&Number.isFinite(Number(child.lat))&&Number.isFinite(Number(child.lon))&&normal(child.commonName)===target);
  candidates.sort((a:any,b:any)=>distance(origin,a)-distance(origin,b));
  const child=candidates[0];
  if(!child)throw Error("No matching "+wantedMode+" station in transport hub");
  stationDetails=child;
  chosen={...chosen,id:child.id,name:child.commonName,lat:child.lat,lon:child.lon,km:distance(origin,child)/1000};
 }
 if(!stationDetails){
  const details=await fetch("https://api.tfl.gov.uk/StopPoint/"+encodeURIComponent(chosen.id),{signal:AbortSignal.timeout(15000),headers:{"Accept":"application/json"}});
  if(!details.ok)throw Error("TfL station details "+details.status);
  const root=await details.json();stationDetails=root.id===chosen.id?root:(root.children||[]).find((x:any)=>x.id===chosen.id);
 }
 const entrances=(stationDetails?.children||[]).filter((x:any)=>/Entrance$/i.test(x.stopType||"")&&x.status!==false&&x.lat!=null&&x.lon!=null&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon))&&(!x.stationNaptan||x.stationNaptan===chosen.id));
 if(!entrances.length&&wantedMode==="tram")entrances.push({id:chosen.id,lat:chosen.lat,lon:chosen.lon,stopType:"TramStop"});
 if(!entrances.length)throw Error("No confirmed walking entrance for "+name);
 const routed=await Promise.all(entrances.map(async(e:any)=>{
  try{
   const url="https://routing.openstreetmap.de/routed-foot/route/v1/driving/"+origin.lon+","+origin.lat+";"+e.lon+","+e.lat+"?overview=false";
   const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)return null;
   const data=await r.json(),route=data.routes?.[0];
   if(data.code!=="Ok"||!Number.isFinite(Number(route?.distance))||Number(route.distance)<=0||!Number.isFinite(Number(route?.duration))||Number(route.duration)<=0||data.waypoints?.some((p:any)=>Number(p.distance)>40))return null;
   return {id:e.id,lat:Number(e.lat),lon:Number(e.lon),meters:Number(route.distance),seconds:Number(route.duration)};
  }catch{return null}
 }));
 const entrance=routed.filter(Boolean).sort((a:any,b:any)=>a.meters-b.meters)[0];
 if(!entrance)throw Error("Walking route to a confirmed station entrance unavailable");
 return {id:chosen.id,name:chosen.name,lat:entrance.lat,lon:entrance.lon,entrance_id:entrance.id,walking_meters:entrance.meters,walking_seconds:entrance.seconds,km:chosen.km};
}
async function sample(origin:any,station:any,date:string,time:string){
 // A station ID can resolve to a nearby bus stop and omit the walk to the
 // station. Routing to its coordinates makes TfL include that final walk.
 const url="https://api.tfl.gov.uk/Journey/JourneyResults/"+origin.lat+","+origin.lon+"/to/"+station.lat+","+station.lon+"?"+new URLSearchParams({date,time,timeIs:"departing",journeyPreference:"leasttime"});
 try{
  let r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{"Accept":"application/json"}});
  if(r.status===429){await new Promise(done=>setTimeout(done,1800));r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{"Accept":"application/json"}})}
  if(!r.ok)throw Error("TfL "+r.status);
  const data=await r.json();
  const list=(data.journeys||[]).filter((j:any)=>{
   if(!Number.isFinite(Number(j.duration))||Number(j.duration)<=0)return false;
   const parse=(x:any)=>{const s=String(x||"");return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(s)?s:s+"Z")};
   const start=parse(j.startDateTime),end=parse(j.arrivalDateTime);
   if(!Number.isFinite(start)||!Number.isFinite(end)||Math.abs((end-start)/60000-Number(j.duration))>1)return false;
   const first=(j.legs||[])[0]?.departurePoint,last=(j.legs||[]).at(-1)?.arrivalPoint;
   if(!first||first.lat==null||first.lon==null||!Number.isFinite(Number(first.lat))||!Number.isFinite(Number(first.lon))||distance(origin,first)>100)return false;
   if(!last||last.lat==null||last.lon==null||!Number.isFinite(Number(last.lat))||!Number.isFinite(Number(last.lon))||distance(station,last)>30)return false;
   return (j.legs||[]).some((l:any)=>!["walking","cycle"].includes(l.mode?.id)&&!!l.mode?.id);
  }).sort((a:any,b:any)=>Number(a.duration)-Number(b.duration));
  const walks=(data.journeys||[]).filter((j:any)=>{const legs=j.legs||[],last=legs.at(-1)?.arrivalPoint,first=legs[0]?.departurePoint;return legs.length>0&&legs.every((l:any)=>l.mode?.id==="walking")&&first?.lat!=null&&first?.lon!=null&&Number.isFinite(Number(first.lat))&&Number.isFinite(Number(first.lon))&&distance(origin,first)<=100&&last?.lat!=null&&last?.lon!=null&&Number.isFinite(Number(last.lat))&&Number.isFinite(Number(last.lon))&&distance(station,last)<=30}).sort((a:any,b:any)=>a.duration-b.duration);
  const foot=walks[0],metres=foot?(foot.legs||[]).reduce((a:number,l:any)=>a+Number(l.distance||0),0):null;
  const fastest=list[0];
  return {time,minutes:fastest?Number(fastest.duration):null,departure:fastest?.startDateTime??null,arrival:fastest?.arrivalDateTime??null,walk_minutes:foot?.duration??null,walk_meters:metres>0?metres:null};
 }catch(e){return {time,minutes:null,reason:String(e)}}
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return reply({});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return reply({error:"Sign in required"},401);
  const who=await admin.auth.getUser(token);
  if(who.error||!who.data.user)return reply({error:"Invalid session"},401);
  const member=await admin.from("members").select("id").eq("id",who.data.user.id).maybeSingle();
  if(member.error||!member.data)return reply({error:"Not a member"},403);
  const {id}=await req.json();
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id))return reply({error:"Invalid property id"},400);
  const data=await admin.from("properties").select("id,latitude,longitude,station_name,station_distance_miles,station_2_name,station_2_distance_miles,station_3_name,station_3_distance_miles,station_commutes").eq("id",id).single();
  if(data.error||!data.data)return reply({error:"House not found"},404);
  const p=data.data,origin={lat:Number(p.latitude),lon:Number(p.longitude)};
  if(p.latitude==null||p.longitude==null||origin.lat<49||origin.lat>61||origin.lon< -9||origin.lon>3)return reply({error:"No reliable geolocation"},422);
  const date=tuesday(),names=[p.station_name,p.station_2_name,p.station_3_name].map((x:any)=>String(x||"").trim());
  const cache=p.station_commutes||{};
  // Audited homes can have three independently routed stations; never replace them with a two-station cache.
  if(cache.station_audit&&JSON.stringify((cache.tfl_final?.names||[]).slice(0,2))===JSON.stringify(names))return reply({commutes:cache,cached:true});
  if(cache.tfl_final?.complete&&cache.tfl_final.version==='tfl-v5'&&cache.tfl_final.origin===origin.lat+","+origin.lon&&JSON.stringify(cache.tfl_final.names)===JSON.stringify(names))return reply({commutes:cache,cached:true});
  const result=[];
  for(let i=0;i<3;i++){
   const name=names[i];
   if(!name){result.push({name:null,avg_minutes:null,samples:[],error:"No station name"});continue}
   try{
    const destination=await findStation(name,origin);
    const samples=[];
    for(const time of times){samples.push(await sample(origin,destination,date,time));await new Promise(done=>setTimeout(done,260))}
    const googleWalk=null;
    const walking_miles=Math.round(destination.walking_meters/1609.344*100)/100;
    const walking_minutes=Math.max(1,Math.round(destination.walking_seconds/60));
    const walking_source="OpenStreetMap walking route to TfL entrance";
    const actual=samples.find(s=>Number.isFinite(s.minutes)&&s.minutes!=null);
    result.push({name,station_id:destination.id,entrance_id:destination.entrance_id,station_name:destination.name,lat:destination.lat,lon:destination.lon,avg_minutes:null,pt_minutes:actual?.minutes??null,pt_departure:actual?.departure??null,pt_arrival:actual?.arrival??null,walking_miles,walking_minutes,walking_source,samples,google_walking:googleWalk,source:"TfL Journey Planner",note:actual?null:"No reliable public-transport route"});
   }catch(e){result.push({name,avg_minutes:null,samples:[],error:String(e)})}
  }
  const availableStations=result.filter(x=>x.name);
  const completed=availableStations.length>0&&availableStations.every(x=>x.walking_miles!=null&&x.walking_minutes!=null);
  const final={version:"tfl-v5",complete:completed,origin:origin.lat+","+origin.lon,names,date,times,results:result,calculated_at:new Date().toISOString(),source:"TfL Journey Planner"};
  const oldResults=cache.results||[];
  const merged=result.map((x:any,i:number)=>({...oldResults[i],...x,walking_miles:x.walking_miles??oldResults[i]?.walking_miles??null,walking_minutes:x.walking_minutes??oldResults[i]?.walking_minutes??null}));
  const out={...cache,origin:final.origin,names,date,times,results:merged,tfl_final:final,calculated_at:final.calculated_at,source:"TfL Journey Planner"};
  // Only save results for the location and station names actually routed.
  // Tolerate PostgREST's rounding of double precision coordinates.
  let request=admin.from("properties").update({station_commutes:out}).eq("id",id).eq("station_commutes",JSON.stringify(cache))
   .gte("latitude",origin.lat-1e-9).lte("latitude",origin.lat+1e-9)
   .gte("longitude",origin.lon-1e-9).lte("longitude",origin.lon+1e-9);
  for(const key of ["station_name","station_2_name","station_3_name"]){
   request=p[key]==null?request.is(key,null):request.eq(key,p[key]);
  }
  const update=await request.select("id");
  if(update.error||!update.data?.length)return reply({error:"Station data changed during calculation",details:update.error?.message},409);
  return reply({commutes:out,cached:false});
 }catch(e){return reply({error:String(e)},500)}
});
