import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateGoogleRoutes} from '../google-routes-runner.js';
const id='00000000-0000-4000-8000-000000000001';
function fixture(failKind){
 const origin='51.41,-0.31',url='https://www.zoopla.co.uk/for-sale/details/123';
 const house={id,url,address:'10 Example Road',latitude:51.41,longitude:-.31,station_name:'Alpha',station_2_name:'',station_3_name:'',manual_overrides:{},journey_estimates:{dilly:{source:'manual',manual_override:true,minutes:65}},station_commutes:{},import_diagnostics:{source_location:{source:'listing-street-view',listing_url:url,address_input:'10 Example Road',latitude:51.41,longitude:-.31}}};
 const preview={tfl_final:{complete:true,origin,names:['Alpha','',''],results:[{name:'Alpha',entrance_id:'A',lat:51.42,lon:-.32}]}};let saved=null,calls=[];
 const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:house})}),functions:{invoke:async(name,{body})=>{assert.equal(body.preview,true);assert.equal(body.discover,true);return {data:{preview:true,commutes:preview}}}},rpc:async(name,args)=>{saved=args;return {data:true}}};
 const extension=async(action,{route})=>{assert.equal(action,'GOOGLE_ROUTE');calls.push(route.kind);if(route.kind===failKind)throw Error('network failed');const destination=route.destination?`${route.destination.lat},${route.destination.lon}`:'address';
  if(route.kind==='station_walk')return {source:'Google Maps',origin,destination,walking_miles:.4,walking_minutes:8};
  if(route.kind==='station_transit')return {source:'Google Maps',origin,destination,unavailable:true};
  return {source:'Google Maps',origin,destination,date:'2026-11-10',departure:'2026-11-10T07:00:00',arrival:'2026-11-10T07:40:00',minutes:40};};
 return {sb,extension,house,calls,saved:()=>saved};
}
test('calculates the complete house using the same origin, then saves once with manual journeys protected',async()=>{const x=fixture();await calculateGoogleRoutes(id,{...x,delay:async()=>{}});assert.deepEqual(x.calls,['station_walk','station_transit','waterloo','dilly','dancelab']);assert.equal(x.saved().p_before,x.house);assert.deepEqual(x.saved().p_patch.journey_estimates.dilly,x.house.journey_estimates.dilly);assert.equal(x.saved().p_patch.import_diagnostics.google_routes_version,'google-maps-ui-v1')});
test('does not write partial results if one Google route fails',async()=>{const x=fixture('dilly');await assert.rejects(()=>calculateGoogleRoutes(id,{...x,delay:async()=>{}}),/network failed/);assert.equal(x.saved(),null)});
test('completed homes do not request routes on another page load',async()=>{const x=fixture();x.house.import_diagnostics.google_routes_version='google-maps-ui-v1';assert.deepEqual(await calculateGoogleRoutes(id,{...x,delay:async()=>{}}),{alreadyDone:true});assert.equal(x.calls.length,0)});

test('an original Street View point on the adjacent road is saved without erasing other data if station lookup fails',async()=>{
 const url='https://www.zoopla.co.uk/for-sale/details/74553564',house={id,url,address:'Alpine Close, Park Hill CR0',latitude:null,longitude:null,manual_overrides:{},station_name:'Existing station',journey_estimates:{dilly:{minutes:72,source:'manual',manual_override:true}},station_commutes:{google_verified:{'Existing station':{walking_minutes:7}}},import_diagnostics:{route_pending:true}};
 let row=structuredClone(house),guards=[],requested;
 const sb={from:()=>{let patch;return {update(x){patch=x;return this},select(){return this},eq(k,v){guards.push(['eq',k,v]);return this},is(k,v){guards.push(['is',k,v]);return this},single:async()=>({data:structuredClone(row)}),maybeSingle:async()=>{row={...row,...patch};return {data:structuredClone(row)}}}},functions:{invoke:async()=>({error:Error('station lookup failed')})},rpc:async()=>{throw Error('route write must not run')}};
 const extension=async(action,args)=>{requested=args.url;return {location_hint:{source:'listing-street-view',address:'18 Chichester Rd, Croydon, England',latitude:51.3694953,longitude:-.0883864}}};
 await assert.rejects(()=>calculateGoogleRoutes(id,{sb,extension,delay:async()=>{}}),/station lookup failed/);
 assert.equal(new URL(requested).searchParams.get('tab'),'street_view');assert.equal(row.latitude,51.3694953);assert.equal(row.longitude,-.0883864);assert.equal(row.address,house.address);assert.deepEqual(row.journey_estimates,house.journey_estimates);assert.deepEqual(row.station_commutes,house.station_commutes);assert.ok(guards.some(([op,key])=>op==='eq'&&key==='manual_overrides'));
});
test('a concurrent change prevents staging a point and does not calculate routes',async()=>{
 const url='https://www.zoopla.co.uk/for-sale/details/123',house={id,url,address:'Example Road',latitude:null,longitude:null,manual_overrides:{},import_diagnostics:{}};let previewed=false;
 const sb={from:()=>({update(){return this},select(){return this},eq(){return this},is(){return this},single:async()=>({data:structuredClone(house)}),maybeSingle:async()=>({data:null})}),functions:{invoke:async()=>{previewed=true}}};
 const extension=async()=>({location_hint:{source:'listing-street-view',address:'2 Nearby Rd',latitude:51.41,longitude:-.31}});
 await assert.rejects(()=>calculateGoogleRoutes(id,{sb,extension,delay:async()=>{}}),/House changed while/);assert.equal(previewed,false);
});
