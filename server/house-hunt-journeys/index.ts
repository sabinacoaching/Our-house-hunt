import {selectJourney,matchesOrigin,matchesDestination,verifiedLocation,nearLocation} from './select.js';
import {createClient} from "npm:@supabase/supabase-js@2.49.8";
const root=Deno.env.get("SUPABASE_URL")!;
const admin=createClient(root,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const destinations=[
 {id:"dancelab",destination:"63 Upper Richmond Road, London SW15 2RD",arrival:"1950"},
 {id:"dilly",destination:"21 Piccadilly, London W1J 0BH",arrival:"1840"},
 {id:"waterloo",destination:"910GWATRLMN",arrival:"0740"}];
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"https://sabinacoaching.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"}});
const dateForTuesday=()=>{const now=new Date();const utcDay=now.getUTCDay();const offset=(2-utcDay+7)%7||7;const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+offset));return dt.toISOString().slice(0,10).replaceAll("-","")};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return respond({});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return respond({error:"Sign in required"},401);
 const who=await admin.auth.getUser(token);
 if(who.error||!who.data.user)return respond({error:"Session invalid"},401);
 const member=await admin.from("members").select("id").eq("id",who.data.user.id).maybeSingle();
 if(member.error||!member.data)return respond({error:"Not a household member"},403);
 let id="";
 try{id=(await req.json()).id}catch{return respond({error:"Invalid request"},400)}
 if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return respond({error:"Invalid house"},400);
 const result=await admin.from("properties").select("id,url,address,latitude,longitude,journey_estimates,import_diagnostics").eq("id",id).single();
 if(result.error||!result.data)return respond({error:"House not found"},404);
 const p=result.data,address=String(p.address||"").trim();
 const verified=verifiedLocation(p);
 if(!verified&&!/^\d+[a-z]?\s+/i.test(address))return respond({error:"A map point or numbered address is required for journeys"},422);
 const queryAddress=verified?verified.lat+','+verified.lon:address;
 const previous=p.journey_estimates||{},date=dateForTuesday(),out={...previous};
 const fresh=destinations.every(d=>previous[d.id]?.manual_override===true||(previous[d.id]?.origin_input===address&&Number.isFinite(Number(previous[d.id]?.minutes))&&previous[d.id]?.calculation_version==='arrival-window-v4'));
 if(fresh)return respond({journeys:out,cached:true});
 const results=await Promise.all(destinations.map(async d=>{
  if(previous[d.id]?.manual_override===true)return {id:d.id,manual:true};
  if(previous[d.id]?.origin_input===address&&previous[d.id]?.calculation_version==='arrival-window-v4'&&Number.isFinite(Number(previous[d.id]?.minutes)))return {id:d.id,cached:true};
  try{
   // TfL returns a small set of journeys for each request. Ask for several
   // nearby arrival deadlines as well as route preferences; a single response
   // can omit a journey in the requested five-minute window.
   const minutes=Number(d.arrival.slice(0,2))*60+Number(d.arrival.slice(2));
   const times=[0,5,10].map(offset=>String(Math.floor((minutes+offset)/60)).padStart(2,'0')+String((minutes+offset)%60).padStart(2,'0'));
   const queries=times.flatMap(time=>["leasttime","leastwalking","leastinterchange"].map(preference=>({time,preference})));
   const settled=await Promise.allSettled(queries.map(async ({time,preference})=>{
    const url="https://api.tfl.gov.uk/Journey/JourneyResults/"+encodeURIComponent(queryAddress)+"/to/"+encodeURIComponent(d.destination)+"?"+new URLSearchParams({date,time,timeIs:"arriving",journeyPreference:preference,alternative:"true"});
    const res=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error("TfL HTTP "+res.status);
    return await res.json();
   }));
   const payloads=settled.flatMap(x=>x.status==='fulfilled'?[x.value]:[]);
   if(payloads.length!==queries.length)throw Error('TfL did not return all requested journey alternatives');
   const journeys=payloads.flatMap(payload=>payload.journeys||[]).filter((j:any)=>{
    const legs=j.legs||[],first=legs[0]?.departurePoint,last=legs[legs.length-1]?.arrivalPoint;
    const lat=Number(first?.lat),lon=Number(first?.lon);
    return (verified?nearLocation(first,verified):matchesOrigin(address,first))&&matchesDestination(d.id,last)&&first?.lat!=null&&first?.lon!=null&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>49&&lat<61&&lon> -9&&lon<3;
   });
   const target=Date.parse(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+'T'+d.arrival.slice(0,2)+':'+d.arrival.slice(2)+':00Z');
   const best=selectJourney(journeys,target);
   if(!best)throw Error("No route with the exact house, destination and a consistent arrival was returned");
   const legs=best.legs,first=legs[0].departurePoint,last=legs[legs.length-1].arrivalPoint;
   return {id:d.id,minutes:Number(best.duration),arrival:best.arrivalDateTime,departure:best.startDateTime,date,origin:verified?verified.lat+','+verified.lon:first.lat+','+first.lon,origin_input:address,origin_address:first.commonName,origin_source:verified?(p.import_diagnostics?.source_location?.source==='listing-street-view'?'Listing Street View':'Nominatim confirmed address'):'TfL confirmed address',destination_address:last.commonName,calculated_at:new Date().toISOString(),source:'TfL Journey Planner',calculation_version:'arrival-window-v4',desired_arrival:d.arrival,destination:d.destination};
  }catch(e){return{id:d.id,error:String(e)}}
 }));
 for(const x of results){if(!('error' in x)&&!('manual' in x)&&!('cached' in x))out[x.id]=x}
 const successful=results.filter(x=>!('error' in x)&&!('manual' in x)&&!('cached' in x));
 if(successful.length){
  let update=admin.from("properties").update({journey_estimates:out}).eq("id",id).eq("address",address).eq("journey_estimates",JSON.stringify(previous));
  // Do not save a route based on a location that was changed while TfL ran.
  if(verified)update=update.eq("latitude",p.latitude).eq("longitude",p.longitude).eq("import_diagnostics",JSON.stringify(p.import_diagnostics));
  const r=await update.select('id');if(r.error||!r.data?.length)return respond({errors:results.filter(x=>"error" in x),saveError:r.error?.message||'Journey data changed while calculating'},409)
 }
 return respond({journeys:out,errors:results.filter(x=>"error" in x),cached:false});
});
