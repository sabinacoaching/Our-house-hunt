import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateGoogleRoutes,needsGoogleRouteResume,functionError} from '../google-routes-runner.js';
const id='00000000-0000-4000-8000-000000000001';
function fixture({failKind=null,discoveryFailure=false,noPoint=false,conflict=false,onRoute=()=>{}}={}){
 const origin='51.41,-0.31',url='https://www.zoopla.co.uk/for-sale/details/123';
 let row={id,url,address:noPoint?'Alpine Close, Park Hill CR0':'10 Example Road',latitude:noPoint?null:51.41,longitude:noPoint?null:-.31,station_name:'Alpha',station_2_name:'',station_3_name:null,comment_sabina:'keep',sort_order:2000,manual_overrides:{},journey_estimates:{dilly:{source:'manual',manual_override:true,minutes:65}},station_commutes:{},import_diagnostics:{route_pending:true}};
 if(!noPoint)row.import_diagnostics.source_location={source:'listing-street-view',listing_url:url,address_input:row.address,latitude:51.41,longitude:-.31};
 const calls=[],writes=[],guards=[];let failed=failKind,conflicts=conflict?1:0;
 const sb={from:()=>{let patch;return {select(){return this},eq(k,v){guards.push([k,v]);return this},is(){return this},update(p){patch=p;return this},single:async()=>({data:structuredClone(row)}),maybeSingle:async()=>{row={...row,...structuredClone(patch)};return {data:structuredClone(row)}}}},functions:{invoke:async(name,{body})=>{
  assert.equal(body.metadata_only,true);assert.equal(body.preview,true);assert.equal(body.discover,true);
  if(discoveryFailure)return {error:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:'TfL station metadata timed out'}),{status:500})}};
  return {data:{preview:true,metadata:{origin,candidates:[{name:'Alpha',station_id:'A',entrances:[{entrance_id:'entrance-a',lat:51.411,lon:-.311}]}],protected_names:[null,null,null],errors:[]}}};
 }},rpc:async(name,args)=>{
  assert.equal(name,'house_hunt_save_google_routes');assert.deepEqual(args.p_before,row);
  if(conflicts-- >0){row.comment_david='edited during routing';return {data:false}}
  row={...row,...structuredClone(args.p_patch)};writes.push(structuredClone(row));return {data:true};
 }};
 const extension=async(action,args)=>{
  if(action==='IMPORT_URL')return {location_hint:{source:'listing-street-view',address:'18 Adjacent Road',latitude:51.41,longitude:-.31}};
  assert.equal(action,'GOOGLE_ROUTE');const {route}=args;calls.push(route.kind);await onRoute(route,row);
  if(route.kind===failed){failed=null;throw Error('network failed')}
  const destination=route.destination?`${route.destination.lat},${route.destination.lon}`:'confirmed destination';
  if(route.kind==='station_walk')return {source:'Google Maps',origin,destination,walking_miles:.4,walking_minutes:8};
  if(route.kind==='station_transit')return {source:'Google Maps',origin,destination,unavailable:true};
  const time={waterloo:'07:40',dilly:'18:40',dancelab:'19:50'}[route.kind],parts=time.split(':').map(Number),dep=parts[0]*60+parts[1]-40;
  return {source:'Google Maps',origin,destination,date:'2026-11-10',departure:'2026-11-10T'+String(Math.floor(dep/60)).padStart(2,'0')+':'+String(dep%60).padStart(2,'0')+':00',arrival:'2026-11-10T'+time+':00',minutes:40};
 };
 return {sb,extension,calls,writes,guards,row:()=>row,replace:p=>{row=p},options:()=>({sb,extension,delay:async()=>{}})};
}
test('saves Google journeys independently, selects station walking and retains manual data',async()=>{
 const x=fixture();await calculateGoogleRoutes(id,x.options());
 assert.deepEqual(x.calls,['waterloo','dilly','dancelab','station_walk','station_transit']);
 assert.equal(x.row().journey_estimates.dilly.minutes,65);assert.equal(x.row().import_diagnostics.google_automatic_journeys.dilly.minutes,40);
 assert.equal(x.row().station_commutes.google_routes.results[0].walking_minutes,8);assert.equal(x.row().station_commutes.google_routes.results[0].pt_minutes,null);
 assert.equal(x.row().comment_sabina,'keep');assert.equal(x.row().sort_order,2000);assert.equal(x.row().import_diagnostics.route_pending,false);
 assert.ok(x.writes.some(p=>p.journey_estimates.waterloo&&p.station_commutes.google_routes==null));
});
test('a failed route does not discard other routes; retry requests only that missing route',async()=>{
 const x=fixture({failKind:'dilly'});await assert.rejects(()=>calculateGoogleRoutes(id,x.options()),/dilly: network failed/);
 assert.equal(x.row().journey_estimates.waterloo.minutes,40);assert.equal(x.row().journey_estimates.dancelab.minutes,40);assert.equal(x.row().import_diagnostics.route_pending,true);
 assert.equal(x.row().import_diagnostics.google_routes_version,null);const before=x.calls.length;
 await calculateGoogleRoutes(id,x.options());assert.deepEqual(x.calls.slice(before),['dilly']);assert.equal(x.row().import_diagnostics.route_pending,false);
});
test('station failure retains all three destination routes and records the actual server error',async()=>{
 const x=fixture({discoveryFailure:true});await assert.rejects(()=>calculateGoogleRoutes(id,x.options()),/TfL station metadata timed out/);
 assert.ok(x.row().journey_estimates.waterloo);assert.ok(x.row().journey_estimates.dancelab);assert.equal(x.row().journey_estimates.dilly.minutes,65);
 assert.equal(x.row().import_diagnostics.route_pending,true);assert.match(x.row().import_diagnostics.google_routes_work.errors.station_discovery,/TfL station metadata timed out/);
});
test('a panorama on the adjacent street supplies the point without changing the listing address',async()=>{
 const x=fixture({noPoint:true,discoveryFailure:true});let shown=0;
 await assert.rejects(()=>calculateGoogleRoutes(id,{...x.options(),onPointSaved:async()=>shown++}),/station metadata timed out/);
 assert.equal(x.row().latitude,51.41);assert.equal(x.row().address,'Alpine Close, Park Hill CR0');assert.ok(shown>0);assert.ok(x.guards.some(([key])=>key==='manual_overrides'));
});
test('a concurrent unrelated edit is merged and the compare-and-save conflict is retried',async()=>{
 const x=fixture({conflict:true});await calculateGoogleRoutes(id,x.options());assert.equal(x.row().comment_david,'edited during routing');
});
test('a manual journey edit made while Google loads takes priority',async()=>{
 const x=fixture({onRoute:(route,row)=>{if(route.kind==='waterloo')row.journey_estimates.waterloo={minutes:77,source:'manual',manual_override:true}}});
 await calculateGoogleRoutes(id,x.options());assert.equal(x.row().journey_estimates.waterloo.minutes,77);assert.equal(x.row().import_diagnostics.google_automatic_journeys.waterloo.minutes,40);
});
test('an address changed during a request prevents stale data from being saved',async()=>{
 const x=fixture({onRoute:(_route,row)=>{row.address='changed'}});await assert.rejects(()=>calculateGoogleRoutes(id,x.options()),/address changed/);assert.equal(x.writes.length,0);
});
test('completed houses issue no network or Google requests after reopening',async()=>{
 const x=fixture();await calculateGoogleRoutes(id,x.options());const before=x.calls.length;assert.deepEqual(await calculateGoogleRoutes(id,x.options()),{alreadyDone:true});assert.equal(x.calls.length,before);
});
test('function errors reveal the response error instead of hiding it behind HTTP status',async()=>{
 const error=await functionError({error:{message:'non-2xx',context:new Response('{"error":"TfL 429"}',{status:500})}},'Station discovery');assert.match(error.message,/TfL 429/);
});
test('only pending imports and changed Google origins are automatically resumed',()=>{
 assert.equal(needsGoogleRouteResume({import_diagnostics:{route_pending:false}}),false);
 assert.equal(needsGoogleRouteResume({import_diagnostics:{route_pending:true}}),true);
 assert.equal(needsGoogleRouteResume({status:'deleted',import_diagnostics:{route_pending:true}}),false);
 const p={address:'New Road',url:'source',latitude:51.4,longitude:-.3,import_diagnostics:{google_routes_version:'google-maps-ui-v1',source_location:{address_input:'Old Road',listing_url:'source',latitude:51.4,longitude:-.3}}};assert.equal(needsGoogleRouteResume(p),true);p.address='Old Road';assert.equal(needsGoogleRouteResume(p),false);
});
