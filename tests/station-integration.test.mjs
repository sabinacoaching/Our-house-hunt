import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const text=readFileSync(new URL('../server/house-hunt-station-commutes/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const code=stripTypeScriptTypes(text,{mode:'strip'});
function setup({conflict=false,stationCount=3,farEndpoint=false}={}){
 const id='00000000-0000-4000-8000-000000000001';let handler;const guards=[];
 let row={id,latitude:51.45,longitude:-.2,station_name:'Alpha',station_2_name:'Beta',station_3_name:stationCount===3?'Gamma':'',station_commutes:{google_verified:{Alpha:{walking_minutes:15,source:'manual'}}}};
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(){let patch=null;return {select(){return patch?Promise.resolve(conflict?{data:[],error:null}:(row={...row,...patch},{data:[{id}],error:null})):this},eq(k,v){if(patch)guards.push(['eq',k,v]);return this},gte(k,v){guards.push(['gte',k,v]);return this},lte(k,v){guards.push(['lte',k,v]);return this},is(k,v){guards.push(['is',k,v]);return this},update(x){patch=x;return this},single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})}}};
 const urls=[];
 const fetch=async url=>{const u=String(url);urls.push(u);if(u.includes('/StopPoint/Search/')){const name=decodeURIComponent(u.split('/StopPoint/Search/')[1].split('?')[0]);return {ok:true,json:async()=>({matches:[{name:name+' Rail Station',id:name,lat:51.45,lon:-.21,modes:['national-rail']}]})}};return {ok:true,json:async()=>({journeys:[{duration:7,legs:[{distance:500,mode:{id:'walking'},arrivalPoint:{lat:51.45,lon:-.21}}]},{duration:10,startDateTime:'2026-11-03T07:30:00',arrivalDateTime:'2026-11-03T07:40:00',legs:[{mode:{id:'bus'},arrivalPoint:{lat:farEndpoint?51.451:51.45,lon:-.21}}]}]})}};
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
