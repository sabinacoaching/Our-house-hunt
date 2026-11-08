import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const text=readFileSync(new URL('../server/house-hunt-station-commutes/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const code=stripTypeScriptTypes(text,{mode:'strip'});
function setup({conflict=false,stationCount=3,farEndpoint=false,hub=false,farOrigin=false,multipleEntrances=false,noEntrances=false}={}){
 const id='00000000-0000-4000-8000-000000000001';let handler;const guards=[];
 let row={id,latitude:51.45,longitude:-.2,station_name:hub?'East Croydon': 'Alpha',station_2_name:hub?'East Croydon Tram Stop':'Beta',station_3_name:stationCount===3?'Gamma':'',station_commutes:{google_verified:{Alpha:{walking_minutes:15,source:'manual'}}}};
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(){let patch=null;return {select(){return patch?Promise.resolve(conflict?{data:[],error:null}:(row={...row,...patch},{data:[{id}],error:null})):this},eq(k,v){if(patch)guards.push(['eq',k,v]);return this},gte(k,v){guards.push(['gte',k,v]);return this},lte(k,v){guards.push(['lte',k,v]);return this},is(k,v){guards.push(['is',k,v]);return this},update(x){patch=x;return this},single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})}}};
 const urls=[];
 const entrance=(id,lon)=>({id:id+'-entrance',stationNaptan:id,stopType:'NaptanRailEntrance',lat:51.45,lon});
 const fetch=async url=>{const u=String(url);urls.push(u);
  if(u.includes('routing.openstreetmap.de'))return {ok:true,json:async()=>({code:'Ok',routes:[{distance:u.includes(';-0.23,')?900:500,duration:u.includes(';-0.23,')?700:420}],waypoints:[{distance:1},{distance:1}]})};
  if(u.includes('/StopPoint/HUBECY'))return {ok:true,json:async()=>({children:[{id:'910GECROYDN',commonName:'East Croydon Rail Station',modes:['national-rail'],lat:51.45,lon:-.215,children:noEntrances?[]:[...(multipleEntrances?[{...entrance('910GECROYDN',-.23),id:'long-entrance'}]:[]),entrance('910GECROYDN',-.21)]},{id:'940GZZCRECR',commonName:'East Croydon Tram Stop',modes:['tram'],lat:51.45,lon:-.22,children:[entrance('940GZZCRECR',-.22)]}]})};
  if(u.includes('/StopPoint/Search/')){const name=decodeURIComponent(u.split('/StopPoint/Search/')[1].split('?')[0]);return {ok:true,json:async()=>({matches:[hub&&name==='East Croydon'?{name:'East Croydon',id:'HUBECY',lat:51.45,lon:-.215,modes:['national-rail','tram']}:{name:name+' Rail Station',id:name,lat:51.45,lon:-.21,modes:['national-rail']}]})}};
  if(u.includes('/StopPoint/')){const id=decodeURIComponent(u.split('/StopPoint/')[1].split('?')[0]);return {ok:true,json:async()=>({id,children:[entrance(id,-.21)]})}};
  return {ok:true,json:async()=>({journeys:[{duration:7,legs:[{distance:500,mode:{id:'walking'},departurePoint:{lat:farOrigin?51.46:51.45,lon:-.2},arrivalPoint:{lat:51.45,lon:u.includes('/to/51.45,-0.22?')?-.22:-.21}}]},{duration:10,startDateTime:'2026-11-03T07:30:00',arrivalDateTime:'2026-11-03T07:40:00',legs:[{mode:{id:'bus'},departurePoint:{lat:51.45,lon:-.2},arrivalPoint:{lat:farEndpoint?51.451:51.45,lon:-.21}}]}]})}};
 new Function('Deno','createClient','fetch','Response','URLSearchParams','AbortSignal','setTimeout',code)({env:{get:()=>''},serve:f=>handler=f},()=>admin,fetch,Response,URLSearchParams,AbortSignal,fn=>{fn();return 1});
 return {run:()=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({id})})),row:()=>row,urls,guards};
}
test('station endpoint saves three routes and preserves manually entered data',async()=>{
 const x=setup(),r=await x.run();assert.equal(r.status,200);const saved=x.row().station_commutes;
 assert.equal(saved.results.length,3);assert.deepEqual(saved.results.map(x=>x.walking_minutes),[7,7,7]);assert.equal(saved.google_verified.Alpha.walking_minutes,15);
 assert.equal(saved.results[0].pt_minutes,10);assert.equal(saved.results[0].pt_departure,'2026-11-03T07:30:00');
 assert.ok(x.urls.filter(u=>u.includes('/Journey/JourneyResults/')).every(u=>u.includes('/to/51.45,-0.21?')));
});
test('does not save a bus route ending at a distant stop as a station journey',async()=>{
 const x=setup({farEndpoint:true}),r=await x.run();assert.equal(r.status,200);
 assert.equal(x.row().station_commutes.results[0].pt_minutes,null);
});
test('station endpoint rejects concurrent changes',async()=>{
 const x=setup({conflict:true}),r=await x.run();assert.equal(r.status,409);assert.equal(x.row().station_commutes.results,undefined);
});
test('saving station routes guards both rounded coordinates and all station names',async()=>{
 const x=setup();await x.run();
 for(const key of ['latitude','longitude']){
  assert.ok(x.guards.some(([op,k])=>op==='gte'&&k===key));
  assert.ok(x.guards.some(([op,k])=>op==='lte'&&k===key));
  assert.ok(!x.guards.some(([op,k])=>op==='eq'&&k===key));
 }
 for(const key of ['station_name','station_2_name','station_3_name'])assert.ok(x.guards.some(([op,k])=>op==='eq'&&k===key));
});
test('two available stations can complete without inventing a third',async()=>{
 const x=setup({stationCount:2}),r=await x.run();assert.equal(r.status,200);
 assert.equal(x.row().station_commutes.tfl_final.complete,true);
 assert.equal(x.row().station_commutes.results[2].name,null);
});

test('resolves East Croydon rail and tram to distinct child stations, not the hub centre',async()=>{
 const x=setup({hub:true}),r=await x.run();assert.equal(r.status,200);
 assert.equal(x.row().station_commutes.results[0].station_id,'910GECROYDN');
 assert.equal(x.row().station_commutes.results[1].station_id,'940GZZCRECR');
 assert.ok(x.urls.some(u=>u.includes('/to/51.45,-0.22?')));
});
test('selects the shortest pedestrian route to a verified entrance, not the station centroid',async()=>{
 const x=setup({hub:true,multipleEntrances:true}),r=await x.run();assert.equal(r.status,200);
 const rail=x.row().station_commutes.results[0];assert.equal(rail.entrance_id,'910GECROYDN-entrance');assert.equal(rail.lon,-.21);assert.equal(rail.walking_miles,.31);
});
test('does not invent walking distance when no railway entrance is confirmed',async()=>{
 const x=setup({hub:true,noEntrances:true}),r=await x.run();assert.equal(r.status,200);
 assert.equal(x.row().station_commutes.tfl_final.complete,false);assert.match(x.row().station_commutes.results[0].error,/No confirmed walking entrance/);
});
test('rejects a distant TfL walking origin but retains a separately checked pedestrian route',async()=>{
 const x=setup({farOrigin:true}),r=await x.run();assert.equal(r.status,200);
 assert.equal(x.row().station_commutes.tfl_final.complete,true);
 assert.equal(x.row().station_commutes.results[0].walking_source,'OpenStreetMap walking route to TfL entrance');
});
