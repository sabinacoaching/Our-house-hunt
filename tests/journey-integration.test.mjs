import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectJourney} from '../server/house-hunt-journeys/select.js';
const original=readFileSync(new URL('../server/house-hunt-journeys/index.ts',import.meta.url),'utf8');
const code=original.replace(/^import .*;\s*$/gm,'').replace(/\)!/g,')').replace(/:(?:unknown|Request|any)\b/g,'');
function setup({conflict=false}={}){
 const id='00000000-0000-4000-8000-000000000001';
 const manual={minutes:55,manual_override:true};
 let row={id,latitude:51.45,longitude:-.2,journey_estimates:{dancelab:manual}},handler,requests=0;
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(table){
  let patch=null;return {select(){return patch?Promise.resolve(conflict?{data:[],error:null}:(row={...row,...patch},{data:[{id}],error:null})):this},eq(){return this},update(x){patch=x;return this},single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})};
 }};
 const fetch=async url=>{requests++;const u=new URL(url),d=u.searchParams.get('date'),t=u.searchParams.get('time');
  const day=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2)}:00Z`;
  const arrival=new Date(Date.parse(day)-4*60000),departure=new Date(arrival.getTime()-50*60000);
  return {ok:true,json:async()=>({journeys:[{startDateTime:departure.toISOString(),arrivalDateTime:arrival.toISOString(),duration:50,legs:[{mode:{id:'tube'}}]}]})};
 };
 new Function('Deno','createClient','fetch','Response','URLSearchParams','AbortSignal','selectJourney',code)({env:{get:()=>''},serve:f=>{handler=f}},()=>admin,fetch,Response,URLSearchParams,AbortSignal,selectJourney);
 return {run:()=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({id})})),row:()=>row,requests:()=>requests,manual};
}
test('route endpoint saves new results and preserves a manual correction',async()=>{
 const a=setup(),response=await a.run();assert.equal(response.status,200);assert.equal(a.requests(),2);
 assert.deepEqual(a.row().journey_estimates.dancelab,a.manual);
 assert.equal(a.row().journey_estimates.waterloo.minutes,50);assert.equal(a.row().journey_estimates.dilly.minutes,50);
});
test('concurrent route edits stop the save',async()=>{
 const a=setup({conflict:true}),response=await a.run();assert.equal(response.status,409);assert.deepEqual(Object.keys(a.row().journey_estimates),['dancelab']);
});
