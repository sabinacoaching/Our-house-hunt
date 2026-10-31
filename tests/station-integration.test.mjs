import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const text=readFileSync(new URL('../server/house-hunt-station-commutes/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const code=stripTypeScriptTypes(text,{mode:'strip'});
function setup({conflict=false}={}){
 const id='00000000-0000-4000-8000-000000000001';let handler;
 let row={id,latitude:51.45,longitude:-.2,station_name:'Alpha',station_2_name:'Beta',station_3_name:'Gamma',station_commutes:{google_verified:{Alpha:{walking_minutes:15,source:'manual'}}}};
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(){let patch=null;return {select(){return patch?Promise.resolve(conflict?{data:[],error:null}:(row={...row,...patch},{data:[{id}],error:null})):this},eq(){return this},update(x){patch=x;return this},single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})}}};
 const fetch=async url=>{const u=String(url);if(u.includes('/StopPoint/Search/')){const name=decodeURIComponent(u.split('/StopPoint/Search/')[1].split('?')[0]);return {ok:true,json:async()=>({matches:[{name:name+' Rail Station',id:name,lat:51.45,lon:-.21,modes:['national-rail']}]})}};return {ok:true,json:async()=>({journeys:[{duration:7,legs:[{distance:500,mode:{id:'walking'}}]},{duration:10,legs:[{mode:{id:'bus'}}]}]})}};
 new Function('Deno','createClient','fetch','Response','URLSearchParams','AbortSignal','setTimeout',code)({env:{get:()=>''},serve:f=>handler=f},()=>admin,fetch,Response,URLSearchParams,AbortSignal,fn=>{fn();return 1});
 return {run:()=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({id})})),row:()=>row};
}
test('station endpoint saves three routes and preserves manually entered data',async()=>{
 const x=setup(),r=await x.run();assert.equal(r.status,200);const saved=x.row().station_commutes;
 assert.equal(saved.results.length,3);assert.deepEqual(saved.results.map(x=>x.walking_minutes),[7,7,7]);assert.equal(saved.google_verified.Alpha.walking_minutes,15);
});
test('station endpoint rejects concurrent changes',async()=>{
 const x=setup({conflict:true}),r=await x.run();assert.equal(r.status,409);assert.equal(x.row().station_commutes.results,undefined);
});
