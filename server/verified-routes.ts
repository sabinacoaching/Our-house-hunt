import {createClient} from "npm:@supabase/supabase-js@2.49.8";
const db=createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"https://sabinacoaching.github.io","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store"};
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const destinations=[
{id:"waterloo",name:"London Waterloo Station",lat:51.503299,lon:-0.11478,time:"07:40"},
{id:"dilly",name:"The Dilly, Piccadilly",lat:51.509439,lon:-0.136203,time:"18:40"},
{id:"dancelab",name:"The Dance Lab, Putney",lat:51.457829,lon:-0.207517,time:"19:50"}];
function normalizeStreet(name){
 return String(name||"").toLowerCase().replace(/&/g,"and").replace(/['’\.]/g,"").replace(/\b(rd|road)\b/g,"road").replace(/\b(st|street)\b/g,"street").replace(/\b(ave|avenue)\b/g,"avenue").replace(/\b(cl|close)\b/g,"close").replace(/[^a-z0-9]+/g," ").trim();
}
function validateGeocode(address,geo){
 const street=String(address).split(",")[0].trim();
 const match=street.match(/^(\d+[a-z]?)\s+(.*)$/i);
 if(!geo||geo.partial_match)return {ok:false,error:"Geocoding returned partial or no address match"};
 const components=geo.address_components||[];
 const found=(kind)=>components.find(x=>x.types?.includes(kind))?.long_name||"";
 const expectedNumber=match?.[1]||null;
 const foundNumber=found("street_number")||null;
 const expectedStreet=normalizeStreet(match?match[2]:street);
 const foundStreet=normalizeStreet(found("route"));
 if(expectedNumber&&expectedNumber.toLowerCase()!==String(foundNumber||"").toLowerCase())return {ok:false,error:"House number mismatch: requested "+expectedNumber+", Google resolved "+(foundNumber||"none"),formatted:geo.formatted_address};
 if(!foundStreet||foundStreet!==expectedStreet)return {ok:false,error:"Street mismatch: requested "+expectedStreet+", resolved "+(foundStreet||"none"),formatted:geo.formatted_address};
 if(geo.geometry?.location_type!=="ROOFTOP")return {ok:false,error:"Geocode is not rooftop-level: "+(geo.geometry?.location_type||"unknown"),formatted:geo.formatted_address};
 if(!components.some(x=>x.types?.includes("country")&&x.short_name==="GB"))return {ok:false,error:"Google geocoded address outside Great Britain"};
 return {ok:true,formatted:geo.formatted_address,placeId:geo.place_id,lat:geo.geometry.location.lat,lon:geo.geometry.location.lng,houseNumber:expectedNumber};
}
function nextTuesday(){
 const dt=new Date(),add=(2-dt.getUTCDay()+7)%7||7;
 return new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()+add)).toISOString().slice(0,10);
}
function londonArrival(day,time){
 const parts=day.split("-").map(Number),t=time.split(":").map(Number);
 const noon=new Date(Date.UTC(parts[0],parts[1]-1,parts[2],12));
 const zone=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",timeZoneName:"shortOffset"}).formatToParts(noon).find(x=>x.type==="timeZoneName")?.value||"GMT";
 const m=zone.match(/GMT([+-]\d+)/),offset=m?Number(m[1]):0;
 return new Date(Date.UTC(parts[0],parts[1]-1,parts[2],t[0]-offset,t[1])).toISOString();
}
async function googleGeocode(key,address){
 const u="https://maps.googleapis.com/maps/api/geocode/json?"+new URLSearchParams({address:address+", United Kingdom",key});
 const r=await fetch(u,{signal:AbortSignal.timeout(13000)});
 if(!r.ok)throw Error("Geocoding HTTP "+r.status);
 const data=await r.json();if(data.status!=="OK")throw Error("Geocode "+data.status);
 return data.results?.[0];
}
async function googleRoute(key,origin,destination,mode,arrival){
 const body={origin:{placeId:origin},destination:destination.placeId?{placeId:destination.placeId}:{location:{latLng:{latitude:destination.lat,longitude:destination.lon}}},travelMode:mode,languageCode:"en-GB",units:"IMPERIAL",computeAlternativeRoutes:mode==="TRANSIT"};
 if(arrival)body.arrivalTime=arrival;
 const response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails,geocodingResults.origin,geocodingResults.destination,fallbackInfo"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("Google Routes "+response.status+" "+(await response.text()).slice(0,140));
 const result=await response.json();
 if(result.fallbackInfo)throw Error("Google Routes used fallback routing");
 const routes=(result.routes||[]).map(x=>({...x,seconds:Number(String(x.duration||"").replace(/s$/,""))})).filter(x=>Number.isFinite(x.seconds)&&x.seconds>0);
 if(!routes.length)throw Error("Google returned no "+mode+" routes");
 if(result.geocodingResults?.origin?.partialMatch||result.geocodingResults?.destination?.partialMatch)throw Error("Google returned an approximate waypoint");
 routes.sort((a,b)=>a.seconds-b.seconds);
 return {route:routes[0],alternatives:routes.length};
}
const pad=(v)=>String(v||"").trim();
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return send({});
 if(req.method!=="POST")return send({error:"POST required"},405);
 try{
  const jwt=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!jwt)return send({error:"Sign in required"},401);
  const auth=await db.auth.getUser(jwt);if(auth.error||!auth.data.user)return send({error:"Invalid session"},401);
  const member=await db.from("members").select("id").eq("id",auth.data.user.id).maybeSingle();
  if(member.error||!member.data)return send({error:"Not a member"},403);
  const {id,dry_run=false}=await req.json();
  if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return send({error:"Invalid property ID"},400);
  const found=await db.from("properties").select("id,address,updated_at,station_name,station_2_name,station_3_name,station_commutes,journey_estimates").eq("id",id).single();
  if(found.error||!found.data)return send({error:"Property not found"},404);
  const p=found.data,key=Deno.env.get("GOOGLE_MAPS_API_KEY");
  if(!key)return send({error:"Google Maps API key is not configured; no data changed"},503);
  const google=await googleGeocode(key,p.address),check=validateGeocode(p.address,google);
  if(!check.ok)return send({error:"Address validation failed; existing values preserved",diagnostic:check,address:p.address},422);
  const origin=check.placeId,day=nextTuesday(),updates={},stationResults=[],errors=[];
  for(const item of destinations){
   try{
    const arr=londonArrival(day,item.time),value=await googleRoute(key,origin,item,"TRANSIT",arr);
    
    updates[item.id]={id:item.id,minutes:Math.ceil(value.route.seconds/60),date:day.replaceAll("-",""),desired_arrival:arr,arrival_deadline:arr,origin:check.lat+","+check.lon,address:p.address,origin_place_id:origin,origin_formatted:check.formatted,source:"Google Routes API",audit_version:"google-address-validated-v1",destination:item.name,destination_coordinates:[item.lat,item.lon],alternatives:value.alternatives,calculated_at:new Date().toISOString(),manual_override:false};
   }catch(e){errors.push({destination:item.id,error:String(e).slice(0,240)})}
  }
  const names=[p.station_name,p.station_2_name,p.station_3_name].filter(x=>pad(x));
  for(const [i,name] of names.entries()){
   try{
    const stationGeo=await googleGeocode(key,name+" station, London");
    const nameCore=String(name).toLowerCase().replace(/\s*\([^)]*\)/g,"").replace(/[^a-z0-9]/g,"");
    const stationMatch=String(stationGeo?.formatted_address||"").toLowerCase().replace(/[^a-z0-9]/g,"").includes(nameCore);
    if(!stationGeo?.place_id||stationGeo.partial_match||!stationMatch||!stationGeo.types?.some(x=>["train_station","transit_station","subway_station","light_rail_station","establishment","point_of_interest"].includes(x)))throw Error("Station geocoded to a different or uncertain destination");
    const result=await googleRoute(key,origin,{placeId:stationGeo.place_id},"WALK");
    stationResults.push({name,station_slot:i,station_place_id:stationGeo.place_id,walking_miles:Math.round(result.route.distanceMeters/1609.344*100)/100,walking_minutes:Math.ceil(result.route.seconds/60),source:"Google Routes API"});
   }catch(e){errors.push({station:name,error:String(e).slice(0,240)});stationResults.push({name,station_slot:i,error:String(e).slice(0,240)})}
  }
  const summary={address:p.address,origin_formatted:check.formatted,origin_place_id:origin,source:"Google Routes API",journeys:updates,stations:stationResults,errors,verified_destinations:Object.keys(updates).length,date:day};
  if(dry_run)return send({...summary,saved:false});
  if(!Object.keys(updates).length&&!stationResults.some(x=>x.walking_minutes!=null))return send({...summary,saved:false,error:"No verified routes; existing data unchanged"},422);
  // Preserve manual routes; persist only fully validated Google entries, and never change the owner's address.
  const newJourneys={...(p.journey_estimates||{})};
  for(const [dest,result] of Object.entries(updates))if(newJourneys[dest]?.manual_override!==true)newJourneys[dest]=result;
  const old=p.station_commutes||{};
  const googleRoutes={origin:p.address,stations:names,results:stationResults,source:"Google Routes API",complete:stationResults.length>0&&stationResults.every(x=>x.walking_minutes!=null),calculated_at:new Date().toISOString(),origin_place_id:origin};
  const update=await db.from("properties").update({journey_estimates:newJourneys,station_commutes:{...old,google_routes:googleRoutes}}).eq("id",id).eq("address",p.address).eq("updated_at",p.updated_at).select("id");
  if(update.error)return send({error:"Could not save validated routes",detail:update.error.message},500);
  if(!update.data?.length)return send({error:"The property changed during Google verification. No calculated values overwritten; refresh and retry."},409);
  return send({...summary,saved:true});
 }catch(e){return send({error:String(e)},500)}
});
