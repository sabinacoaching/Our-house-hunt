import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync(new URL('../server/house-hunt-station-commutes/station-discovery.ts',import.meta.url),'utf8').replace(/^export /gm,''),{mode:'strip'});
function fixture({retry=false}={}){
 const urls=[],waits=[];let throttled=retry;
 const stops=[{id:'RA',commonName:'Alpha Rail Station',modes:['national-rail'],lat:51.451,lon:-.3},{id:'TB',commonName:'Beta Underground Station',modes:['tube'],lat:51.452,lon:-.3}];
 const fetch=async url=>{urls.push(String(url));if(throttled){throttled=false;return {ok:false,status:429,headers:{get:name=>name==='Retry-After'?'5':null}}}
  if(url.includes('/StopPoint?'))return {ok:true,json:async()=>({stopPoints:stops})};
  if(url.includes('/Search/'))throw Error('Discovery must not search again for known TfL station IDs');
  const stop=stops.find(x=>url.endsWith('/'+x.id));return {ok:true,json:async()=>({...stop,children:[{id:stop.id+'-entry',stationNaptan:stop.id,stopType:'NaptanRailEntrance',lat:stop.lat,lon:stop.lon},{id:'other-station',stationNaptan:'different',stopType:'NaptanRailEntrance',lat:51.45,lon:-.3}]})};
 };
 const discover=new Function('fetch','setTimeout',code+';return discoverStationEntrances')(fetch,(fn,ms)=>{waits.push(ms);fn();return 1});
 return {discover,urls,waits};
}
test('discovers identities and real entrances without invoking a routing or search service',async()=>{
 const x=fixture(),r=await x.discover({lat:51.45,lon:-.3},{manual_overrides:{}});assert.deepEqual(r.candidates.map(x=>x.name),['Alpha','Beta Underground']);assert.equal(x.urls.length,3);assert.equal(r.candidates[0].entrances.length,1);assert.equal(r.candidates[0].entrances[0].entrance_id,'RA-entry');assert.ok(x.urls.every(x=>x.startsWith('https://api.tfl.gov.uk/')));assert.ok(!('walking_minutes' in r.candidates[0]));
});
test('a temporary TfL limit is retried and cached metadata is reused',async()=>{
 const x=fixture({retry:true});await x.discover({lat:51.45,lon:-.3},{});const count=x.urls.length;await x.discover({lat:51.45,lon:-.3},{});assert.equal(x.urls.length,count);assert.equal(x.urls.filter(x=>x.includes('/StopPoint?')).length,2);
 assert.ok(x.waits.some(ms=>ms>=4900&&ms<=5000),'honours the provider Retry-After cooldown');
});
test('the protected station names remain associated with their original slots',async()=>{
 const x=fixture(),r=await x.discover({lat:51.45,lon:-.3},{station_2_name:'Beta Underground',manual_overrides:{station_2_name:true}});assert.deepEqual(r.protected_names,[null,'Beta Underground',null]);
});
