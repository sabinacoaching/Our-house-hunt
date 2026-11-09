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
