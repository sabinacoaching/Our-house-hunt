import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectGoogleStations} from '../google-station-selection.js';
const origin={lat:51.45,lon:-.3},originKey='51.45,-0.3';
function fixture(){
 const values=[['Alpha',51.451,2],['Beta',51.452,.3],['Gamma',51.453,.4],['Delta',51.454,.5],['Far',51.49,5]];
 const metadata={origin:originKey,protected_names:[null,null,null],candidates:values.map(([name,lat])=>({name,station_id:name,entrances:[{entrance_id:name+'-entry',lat,lon:-.3}]}))};
 const calls=[],walks={};
 const route=async(destination,name)=>{calls.push(name);const miles=values.find(x=>x[0]===name)[2];return {source:'Google Maps',origin:originKey,destination:destination.lat+','+destination.lon,walking_miles:miles,walking_minutes:Math.ceil(miles*20)}};
 return {metadata,calls,options:{origin,walks,route},walks};
}
test('selects by actual Google walking routes when the nearest straight-line station is a long walk',async()=>{
 const x=fixture(),r=await selectGoogleStations(x.metadata,x.options);assert.deepEqual(r.preview.tfl_final.names,['Beta','Gamma','Delta']);assert.ok(!x.calls.includes('Far'));assert.equal(r.stations[0].walking.walking_miles,.3);
});
test('reuses checked entrances after a retry instead of reopening every route',async()=>{
 const x=fixture();await selectGoogleStations(x.metadata,x.options);const count=x.calls.length;await selectGoogleStations(x.metadata,x.options);assert.equal(x.calls.length,count);
});
test('preserves a manually selected station and its slot while choosing the others',async()=>{
 const x=fixture();x.metadata.protected_names=[null,'Alpha Railway Station',null];const r=await selectGoogleStations(x.metadata,x.options);assert.deepEqual(r.preview.tfl_final.names,['Beta','Alpha Railway Station','Gamma']);
});
test('does not call an unchecked possibly-nearer station a completed nearest-station set',async()=>{
 const x=fixture(),route=x.options.route;x.options.route=async(point,name)=>{if(name==='Beta')throw Error('Maps did not load');return route(point,name)};
 await assert.rejects(()=>selectGoogleStations(x.metadata,x.options),/potentially nearer station/);assert.ok(Object.keys(x.walks).length>0);
});
test('refuses to use station metadata for a different house point',async()=>{
 const x=fixture();x.metadata.origin='51.4,-.2';await assert.rejects(()=>selectGoogleStations(x.metadata,x.options),/different map point/);assert.equal(x.calls.length,0);
});
test('chooses the shortest checked entrance of one station and never duplicates that station',async()=>{
 const x=fixture();x.metadata.candidates[0].entrances.push({entrance_id:'short-entrance',lat:51.4501,lon:-.299});const route=x.options.route;x.options.route=async(point,name)=>point.lon===-.299?{source:'Google Maps',origin:originKey,destination:point.lat+','+point.lon,walking_miles:.2,walking_minutes:4}:route(point,name);
 const r=await selectGoogleStations(x.metadata,x.options);assert.deepEqual(r.preview.tfl_final.names,['Alpha','Beta','Gamma']);assert.equal(r.preview.tfl_final.results[0].entrance_id,'short-entrance');
});
test('a temporarily missing nearby station asks for fresh metadata and keeps checked Google walks',async()=>{
 const x=fixture();x.metadata.errors=[{name:'Missing',lat:51.4501,lon:-.3,error:'Error: TfL 429 at /StopPoint/missing',retry_after_ms:5000}];
 await assert.rejects(()=>selectGoogleStations(x.metadata,x.options),error=>error.code==='STATION_METADATA_RETRY'&&error.retry_after_ms===5000);
 assert.ok(Object.keys(x.walks).length>0);
});
test('an identity with no public entrance does not block routing other eligible stations',async()=>{
 const x=fixture();x.metadata.errors=[{name:'Unavailable',lat:51.4501,lon:-.3,error:'Error: No public entrance in TfL station metadata',retryable:false}];
 const r=await selectGoogleStations(x.metadata,x.options);assert.deepEqual(r.preview.tfl_final.names,['Beta','Gamma','Delta']);
});
