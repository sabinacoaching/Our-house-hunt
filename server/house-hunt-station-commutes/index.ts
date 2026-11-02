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
 const chosen=scored[0];
 if(!chosen||chosen.km>8||chosen.score>35)throw Error("Station could not be matched accurately");
 return {id:chosen.id,name:chosen.name,lat:chosen.lat,lon:chosen.lon,km:chosen.km};
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
   const last=(j.legs||[]).at(-1)?.arrivalPoint;
   if(!last||last.lat==null||last.lon==null||!Number.isFinite(Number(last.lat))||!Number.isFinite(Number(last.lon))||distance(station,last)>30)return false;
   return (j.legs||[]).some((l:any)=>!["walking","cycle"].includes(l.mode?.id)&&!!l.mode?.id);
  }).sort((a:any,b:any)=>Number(a.duration)-Number(b.duration));
  const walks=(data.journeys||[]).filter((j:any)=>{const legs=j.legs||[],last=legs.at(-1)?.arrivalPoint;return legs.length>0&&legs.every((l:any)=>l.mode?.id==="walking")&&last?.lat!=null&&last?.lon!=null&&Number.isFinite(Number(last.lat))&&Number.isFinite(Number(last.lon))&&distance(station,last)<=30}).sort((a:any,b:any)=>a.duration-b.duration);
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
  if(cache.tfl_final?.complete&&cache.tfl_final.origin===origin.lat+","+origin.lon&&JSON.stringify(cache.tfl_final.names)===JSON.stringify(names))return reply({commutes:cache,cached:true});
  const result=[];
  for(let i=0;i<3;i++){
   const name=names[i];
   if(!name){result.push({name:null,avg_minutes:null,samples:[],error:"No station name"});continue}
   try{
    const destination=await findStation(name,origin);
    const samples=[];
    for(const time of times){samples.push(await sample(origin,destination,date,time));await new Promise(done=>setTimeout(done,260))}
    const googleWalk=null;
    const walkingSample=samples.find(x=>x.walk_meters!=null&&x.walk_minutes!=null);
    let walking_miles=walkingSample?.walk_meters!=null?Math.round(walkingSample.walk_meters/1609.344*100)/100:null;
    let walking_minutes=walkingSample?.walk_minutes??null;
    let walking_source=walking_miles!=null?"TfL Journey Planner":null;
    if(walking_miles==null){
      try{
        const u="https://routing.openstreetmap.de/routed-foot/route/v1/driving/"+origin.lon+","+origin.lat+";"+destination.lon+","+destination.lat+"?overview=false";
        const rr=await fetch(u,{signal:AbortSignal.timeout(12000)});
        if(rr.ok){const route=(await rr.json()).routes?.[0];if(route){walking_miles=Math.round(Number(route.distance)/1609.344*100)/100;walking_minutes=Math.round(Number(route.duration)/60);walking_source="OpenStreetMap walking route"}}
      }catch(e){console.warn("Walking route unavailable",String(e))}
    }
    const actual=samples.find(s=>Number.isFinite(s.minutes)&&s.minutes!=null);
    result.push({name,station_id:destination.id,station_name:destination.name,lat:destination.lat,lon:destination.lon,avg_minutes:null,pt_minutes:actual?.minutes??null,pt_departure:actual?.departure??null,pt_arrival:actual?.arrival??null,walking_miles,walking_minutes,walking_source,samples,google_walking:googleWalk,source:"TfL Journey Planner",note:actual?null:"No reliable public-transport route"});
   }catch(e){result.push({name,avg_minutes:null,samples:[],error:String(e)})}
  }
  const availableStations=result.filter(x=>x.name);
  const completed=availableStations.length>0&&availableStations.every(x=>x.walking_miles!=null&&x.walking_minutes!=null);
  const final={version:"tfl-v3",complete:completed,origin:origin.lat+","+origin.lon,names,date,times,results:result,calculated_at:new Date().toISOString(),source:"TfL Journey Planner"};
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
