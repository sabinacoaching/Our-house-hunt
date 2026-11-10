import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareStationChanges,pendingStationChoices,stationChoice,stationContext,sameStationContext} from '../station-choice-state.js';
import {calculateManualStationRoutes,resolveManualStation} from '../manual-station-routes.js';
import {createEditHistory} from '../edit-history.js';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const copy=value=>structuredClone(canonical(value));
function fixture({onRoute=()=>{},conflict=false,noSource=false,failTransit=false}={}){
 const id='house-a',url='https://www.zoopla.co.uk/for-sale/details/123';
 let row={id,url,address:'10 Example Road',latitude:51.37,longitude:-.09,status:'interested',station_name:'Alpha',station_2_name:'Beta',station_3_name:'Gamma',station_distance_miles:.3,station_2_distance_miles:.4,station_3_distance_miles:.5,comment_sabina:'Keep comment',comment_david:'Keep decision',sort_order:3000,manual_overrides:{},journey_estimates:{waterloo:{minutes:50},dilly:{minutes:60},dancelab:{minutes:40}},station_commutes:{google_routes:{origin:'10 Example Road',stations:['Alpha','Beta','Gamma'],results:[{walking_minutes:10},{walking_minutes:15},{walking_minutes:20}]},google_verified:{}},import_diagnostics:{route_pending:false,google_routes_version:'google-maps-ui-v2',source_location:{source:'listing-street-view',listing_url:url,address_input:'10 Example Road',latitude:51.37,longitude:-.09}}};
 if(noSource)delete row.import_diagnostics.source_location;
 const calls=[],patches=[],resolved=[];let failed=failTransit,conflicts=conflict?1:0,sequence=0;
 const match=(value,filter)=>{let target=filter;if(typeof target==='string'&&/^[{[]/.test(target))try{target=JSON.parse(target)}catch{}return JSON.stringify(canonical(value??null))===JSON.stringify(canonical(target??null))};
 const sb={from:()=>{let patch=null,filters=[];const result=()=>{
  if(patch&&conflicts-->0){row.station_commutes.google_verified.Other={walking_minutes:17,source:'manual'};return {data:null,error:null}}
  if(!filters.every(([key,value])=>match(row[key],value)))return {data:null,error:null};
  if(patch){patches.push(copy(patch));row={...row,...copy(patch)}}return {data:copy(row),error:null};
 };return {select(){return this},eq(key,value){filters.push([key,value]);return this},is(key,value){filters.push([key,value]);return this},update(value){patch=value;return this},single:async()=>result(),maybeSingle:async()=>result(),then:done=>Promise.resolve(result()).then(done)}}};
 sb.rpc=async(name,{p_before,p_patch})=>{
  assert.ok(['house_hunt_save_google_routes','house_hunt_save_manual_edit'].includes(name));
  if(name==='house_hunt_save_google_routes'){
   assert.notEqual(p_patch.latitude,null);assert.notEqual(p_patch.longitude,null);
   assert.deepEqual(p_patch.station_commutes.google_verified,Object.hasOwn(p_before.station_commutes||{},'google_verified')?p_before.station_commutes.google_verified:{});
  }
  if(conflicts-->0){row.station_commutes.google_verified.Other={walking_minutes:17,source:'manual'};return {data:false}}
  if(JSON.stringify(canonical(p_before))!==JSON.stringify(canonical(row)))return {data:false};
  patches.push(copy(p_patch));row={...row,...copy(p_patch)};return {data:true};
 };
 const extension=async(action,args)=>{
  if(action==='IMPORT_URL'){calls.push('listing');return {location_hint:{source:'listing-street-view',address:'Adjacent Road',latitude:51.371,longitude:-.091}}}
  const {route}=args;calls.push(route.kind+':'+route.destination.name);await onRoute(route,row);
  if(route.kind==='station_transit'&&failed)throw Error('network timed out');
  const common={source:'Google Maps',origin:route.origin.lat+','+route.origin.lon,destination:route.destination.query,station_id:route.destination.station_id,url:'https://www.google.com/maps/route'};
  return route.kind==='station_walk'?{...common,walking_miles:.2,walking_minutes:6}:{...common,minutes:8,date:'2026-11-17',departure:'2026-11-17T07:30:00',arrival:'2026-11-17T07:38:00'};
 };
 const resolveStation=async(_p,name)=>{resolved.push(name);return {name,station_id:'940GZZCR'+name.replace(/\W/g,''),transport_type:'tram',query:name+' Tram Stop, London, UK',lat:51.371,lon:-.091}};
 const rename=changes=>{row={...row,...prepareStationChanges(row,changes,{requestId:()=>String(++sequence),now:()=> '2026-11-10T12:00:00Z'})}};
 return {sb,extension,resolveStation,calls,patches,resolved,rename,row:()=>row,replace:value=>{row=value},clearFailure:()=>{failed=false},options:()=>({sb,extension,resolveStation,delay:async()=>{}})};
}

test('saving a station name atomically marks its own slot pending and removes distances tied to the previous station',()=>{
 const x=fixture(),p=x.row();p.manual_overrides.station_3_distance_miles=true;p.station_commutes.google_verified.Gamma={walking_minutes:33};
 x.rename({station_3_name:'Lebanon Road',manual_overrides:{...p.manual_overrides,station_3_name:true}});
 const after=x.row();assert.equal(after.station_3_distance_miles,null);assert.equal(after.manual_overrides.station_3_distance_miles,undefined);
 assert.equal(after.manual_overrides.station_3_name,true);assert.equal(after.station_commutes.google_verified.Gamma.walking_minutes,33);
 assert.deepEqual(pendingStationChoices(after).map(x=>x.field),['station_3_name']);
 assert.equal(after.station_2_distance_miles,.4);assert.equal(after.journey_estimates,p.journey_estimates);
});
test('JSONB key order does not invalidate a persisted pending station',()=>{
 const x=fixture();x.rename({station_3_name:'Lebanon Road'});x.replace(copy(x.row()));
 assert.ok(stationChoice(x.row(),2));assert.ok(sameStationContext(copy(stationContext(x.row())),stationContext(x.row())));
});
test('only the changed station is routed and other journeys, station slots and comments remain untouched',async()=>{
 const x=fixture(),before=copy(x.row());x.rename({station_3_name:'Lebanon Road'});
 await calculateManualStationRoutes('house-a',x.options());const p=x.row();
 assert.deepEqual(x.calls,['station_walk:Lebanon Road','station_transit:Lebanon Road']);
 assert.equal(p.station_3_distance_miles,.2);assert.equal(stationChoice(p,2).state,'complete');
 assert.deepEqual(p.journey_estimates,before.journey_estimates);assert.deepEqual(p.station_commutes.google_routes,before.station_commutes.google_routes);
 assert.equal(p.comment_sabina,before.comment_sabina);assert.equal(p.comment_david,before.comment_david);assert.equal(p.status,before.status);
 assert.equal(pendingStationChoices(p).length,0);const count=x.calls.length;await calculateManualStationRoutes('house-a',x.options());assert.equal(x.calls.length,count);
});
test('a transport failure retains the new walk; Refresh retries only the missing transport component',async()=>{
 const x=fixture({failTransit:true});x.rename({station_name:'New tram'});
 await assert.rejects(()=>calculateManualStationRoutes('house-a',x.options()),/network timed out/);
 assert.equal(stationChoice(x.row(),0).walking.walking_minutes,6);assert.equal(x.row().station_distance_miles,.2);
 x.clearFailure();const count=x.calls.length;await calculateManualStationRoutes('house-a',x.options());
 assert.deepEqual(x.calls.slice(count),['station_transit:New tram']);assert.equal(stationChoice(x.row(),0).state,'complete');
});
test('a second name edit while Google loads discards the old answer and processes the newer choice',async()=>{
 let changed=false,x;x=fixture({onRoute:route=>{if(route.kind==='station_walk'&&!changed){changed=true;x.rename({station_3_name:'Newest tram'})}}});
 x.rename({station_3_name:'First tram'});await calculateManualStationRoutes('house-a',x.options());
 assert.equal(x.row().station_3_name,'Newest tram');assert.equal(stationChoice(x.row(),2).destination.name,'Newest tram');
 assert.deepEqual(x.calls,['station_walk:First tram','station_walk:Newest tram','station_transit:Newest tram']);
});
test('a walking correction made while Google loads wins over its automatic distance',async()=>{
 const x=fixture({onRoute:(route,row)=>{if(route.kind==='station_walk'){row.station_3_distance_miles=.7;row.manual_overrides.station_3_distance_miles=true;row.station_commutes.google_verified['New tram']={walking_minutes:19,source:'manual'}}}});
 x.rename({station_3_name:'New tram'});await calculateManualStationRoutes('house-a',x.options());
 assert.equal(x.row().station_3_distance_miles,.7);assert.equal(x.row().station_commutes.google_verified['New tram'].walking_minutes,19);
});
test('compare-and-save merges a concurrent route annotation instead of overwriting it',async()=>{
 const x=fixture({conflict:true});x.rename({station_2_name:'New tram'});await calculateManualStationRoutes('house-a',x.options());
 assert.equal(x.row().station_commutes.google_verified.Other.walking_minutes,17);assert.equal(stationChoice(x.row(),1).state,'complete');
});
test('an answer for the wrong station cannot be saved as the new walking result',async()=>{
 const x=fixture();x.rename({station_name:'New tram'});const original=x.extension;
 await assert.rejects(()=>calculateManualStationRoutes('house-a',{...x.options(),extension:async(...args)=>({...await original(...args),station_id:'wrong-station'})}),/did not match/);
 assert.equal(stationChoice(x.row(),0).walking,null);assert.equal(x.row().station_distance_miles,null);
});
test('older homes can obtain their listing panorama for this station without replacing their saved coordinates',async()=>{
 const x=fixture({noSource:true});x.rename({station_2_name:'New tram'});await calculateManualStationRoutes('house-a',x.options());
 assert.equal(x.calls[0],'listing');assert.equal(stationChoice(x.row(),1).walking.origin,'51.371,-0.091');assert.equal(x.row().latitude,51.37);
});
test('a house without coordinates saves its actual listing point and retains a valid per-station context',async()=>{
 const x=fixture({noSource:true});x.row().latitude=null;x.row().longitude=null;x.rename({station_2_name:'New tram'});
 await calculateManualStationRoutes('house-a',x.options());
 assert.equal(x.row().latitude,51.371);assert.equal(x.row().longitude,-.091);assert.equal(stationChoice(x.row(),1).state,'complete');
});
test('large legacy caches and absent google_verified are saved through the existing atomic RPC',async()=>{
 const x=fixture();delete x.row().station_commutes.google_verified;x.row().station_commutes.legacy_cache='x'.repeat(20000);x.rename({station_name:'New tram'});
 await calculateManualStationRoutes('house-a',x.options());
 assert.equal(stationChoice(x.row(),0).state,'complete');assert.equal(x.row().station_commutes.legacy_cache.length,20000);assert.deepEqual(x.row().station_commutes.google_verified,{});
});
test('a bare tram name resolves to its real tram identity, and an ambiguous bare station name prefers rail',async()=>{
 const origin={lat:51.37,lon:-.09};
 const fetcher=async()=>({ok:true,json:async()=>({matches:[{id:'940GZZCRLEB',name:'Lebanon Road Tram Stop',lat:51.375,lon:-.08}]})});
 const tram=await resolveManualStation({},'Lebanon Road',origin,{fetcher});
 assert.equal(tram.transport_type,'tram');assert.match(tram.query,/Tram Stop/);
 const rail=await resolveManualStation({},'East Croydon',origin,{fetcher:async()=>({ok:true,json:async()=>({matches:[{id:'940GZZCRECR',name:'East Croydon Tram Stop',lat:51.375,lon:-.08},{id:'910GECROYDN',name:'East Croydon Rail Station',lat:51.375,lon:-.09}]})})});
 assert.equal(rail.transport_type,'rail');assert.equal(rail.station_id,'910GECROYDN');
});
test('two edited slots in one house are completed independently',async()=>{
 const x=fixture();x.rename({station_name:'First tram',station_2_name:'Second tram'});await calculateManualStationRoutes('house-a',x.options());
 assert.equal(stationChoice(x.row(),0).state,'complete');assert.equal(stationChoice(x.row(),1).state,'complete');assert.equal(x.row().station_3_name,'Gamma');
});
test('Undo can restore the original station and its manual distance after automatic calculation',async()=>{
 const previous=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem(){}};
 try{
  const x=fixture(),p=x.row();p.manual_overrides.station_3_distance_miles=true;p.station_3_distance_miles=.8;
  const history=createEditHistory({sb:x.sb,prepareChanges:prepareStationChanges});
  const saved=await history.save(p,{station_3_name:'New tram',manual_overrides:{...p.manual_overrides,station_3_name:true}});assert.equal(saved.error,null);
  await calculateManualStationRoutes('house-a',x.options());const undone=await history.undo();assert.equal(undone.error,null);
  assert.equal(x.row().station_3_name,'Gamma');assert.equal(x.row().station_3_distance_miles,.8);assert.equal(x.row().manual_overrides.station_3_distance_miles,true);
  assert.equal(pendingStationChoices(x.row()).length,1);
 }finally{globalThis.localStorage=previous}
});

test('a station edit merges fresh annotations and manual flags even when the open editor holds an older row',async()=>{
 const previous=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem(){}};
 try{
  const x=fixture(),p=copy(x.row());
  x.row().station_commutes.google_verified.Beta={walking_minutes:27,source:'manual'};
  x.row().manual_overrides.station_2_distance_miles=true;x.row().station_2_distance_miles=.9;
  x.row().comment_david='A newer decision';
  const history=createEditHistory({sb:x.sb,prepareChanges:prepareStationChanges});
  const saved=await history.save(p,{station_name:'New tram',manual_overrides:{station_name:true}});
  assert.equal(saved.error,null);assert.equal(x.row().station_commutes.google_verified.Beta.walking_minutes,27);
  assert.equal(x.row().station_2_distance_miles,.9);assert.equal(x.row().manual_overrides.station_2_distance_miles,true);
  assert.equal(x.row().manual_overrides.station_name,true);assert.equal(x.row().comment_david,'A newer decision');
  assert.equal(pendingStationChoices(x.row()).length,1);
 }finally{globalThis.localStorage=previous}
});
test('the initial station edit retries a concurrent save without losing the newer route annotation',async()=>{
 const previous=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem(){}};
 try{
  const x=fixture({conflict:true}),history=createEditHistory({sb:x.sb,prepareChanges:prepareStationChanges});
  const saved=await history.save(copy(x.row()),{station_name:'New tram',manual_overrides:{station_name:true}});
  assert.equal(saved.error,null);assert.equal(x.row().station_name,'New tram');
  assert.equal(x.row().station_commutes.google_verified.Other.walking_minutes,17);
 }finally{globalThis.localStorage=previous}
});
test('an older station editor cannot replace a newer station name',async()=>{
 const previous=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem(){}};
 try{
  const x=fixture(),p=copy(x.row());x.rename({station_name:'A newer choice'});
  const history=createEditHistory({sb:x.sb,prepareChanges:prepareStationChanges});
  const saved=await history.save(p,{station_name:'An older choice',manual_overrides:{station_name:true}});
  assert.match(saved.error.message,/changed while you were editing/);assert.equal(x.row().station_name,'A newer choice');assert.equal(history.canUndo(),false);
 }finally{globalThis.localStorage=previous}
});
