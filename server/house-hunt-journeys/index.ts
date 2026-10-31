import {selectJourney} from './select.js';
import {createClient} from "npm:@supabase/supabase-js@2.49.8";
const root=Deno.env.get("SUPABASE_URL")!;
const admin=createClient(root,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const destinations=[
{id:"dancelab",name:"The Dance Lab",destination:"63 Upper Richmond Road, London SW15 2RD",arrival:"1950"},
{id:"dilly",name:"The Dilly",destination:"21 Piccadilly, London W1J 0BH",arrival:"1840"},
{id:"waterloo",name:"Waterloo",destination:"910GWATRLMN",arrival:"0740"}];
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
 const result=await admin.from("properties").select("id,latitude,longitude,journey_estimates").eq("id",id).single();
 if(result.error||!result.data)return respond({error:"House not found"},404);
 const p=result.data;
 const lat=Number(p.latitude),lon=Number(p.longitude);
 if(p.latitude==null||p.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<49||lat>61||lon< -9||lon>3)return respond({error:"Property coordinates missing"},422);
 const previous=p.journey_estimates||{},date=dateForTuesday(),out={...previous};
 const fresh=destinations.every(d=>previous[d.id]?.manual_override===true||(previous[d.id]?.origin===lat+','+lon&&Number.isFinite(Number(previous[d.id]?.minutes))&&previous[d.id]?.calculation_version==='arrival-window-v3'));
 if(fresh)return respond({journeys:out,cached:true});
 const results=await Promise.all(destinations.map(async d=>{
  if(previous[d.id]?.manual_override===true)return {id:d.id,manual:true};
  const url="https://api.tfl.gov.uk/Journey/JourneyResults/"+lat+","+lon+"/to/"+encodeURIComponent(d.destination)+"?"+new URLSearchParams({date,time:d.arrival,timeIs:"arriving",journeyPreference:"leasttime"});
  try{
   const res=await fetch(url,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(16000)});
   if(!res.ok)throw Error("TfL HTTP "+res.status);
   const payload=await res.json();
   const journeys=(payload.journeys||[]).filter((j:any)=>Number.isFinite(Number(j.duration))&&Number(j.duration)>0);
   if(!journeys.length)throw Error("No journey returned");
   const target=Date.parse(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+'T'+d.arrival.slice(0,2)+':'+d.arrival.slice(2)+':00Z');
   const best=selectJourney(journeys,target);
   if(!best)throw Error("No consistent public transport journey arrives by the target");
   return {id:d.id,minutes:Number(best.duration),arrival:best.arrivalDateTime||null,departure:best.startDateTime||null,date,origin:lat+','+lon,calculated_at:new Date().toISOString(),source:'TfL Journey Planner',calculation_version:'arrival-window-v3',desired_arrival:d.arrival,destination:d.destination};
  }catch(e){return{id:d.id,error:String(e)}}
 }));
 for(const x of results){if(!('error' in x)&&!('manual' in x))out[x.id]=x}
 const successful=results.filter(x=>!('error' in x)&&!('manual' in x));
 if(successful.length){const r=await admin.from("properties").update({journey_estimates:out}).eq("id",id).eq("journey_estimates",JSON.stringify(previous)).select('id');if(r.error||!r.data?.length)return respond({errors:results.filter(x=>"error" in x),saveError:r.error?.message||'Journey data changed while calculating'},409)}
 return respond({journeys:out,errors:results.filter(x=>"error" in x),cached:false});
});
