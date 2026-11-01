import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectJourney,matchesOrigin,matchesDestination,verifiedLocation,nearLocation} from '../server/house-hunt-journeys/select.js';
const original=readFileSync(new URL('../server/house-hunt-journeys/index.ts',import.meta.url),'utf8');
const code=original.replace(/^import .*;\s*$/gm,'').replace(/\)!/g,')').replace(/:(?:unknown|Request|any)\b/g,'');
function setup({conflict=false,wrongOrigin=false,verified=false,farOrigin=false,geoConflict=false}={}){
 const id='00000000-0000-4000-8000-000000000001';
 const manual={minutes:55,manual_override:true};
 let row={id,address:'37 Longford Road, Twickenham',latitude:51.45,longitude:-.2,journey_estimates:{dancelab:manual}},handler,requests=0;
 if(verified)row.import_diagnostics={geocode_verified:{source:'nominatim',address_input:row.address,latitude:51.45,longitude:-.2,house_number:'37',road:'Longford Road'}};
 const urls=[];
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(table){
  let patch=null,locationChecked=false;return {select(){return patch?Promise.resolve(conflict||(geoConflict&&locationChecked)?{data:[],error:null}:(row={...row,...patch},{data:[{id}],error:null})):this},eq(key){if(key==='latitude')locationChecked=true;return this},update(x){patch=x;return this},single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})};
 }};
 const fetch=async url=>{requests++;urls.push(String(url));const u=new URL(url),d=u.searchParams.get('date'),t=u.searchParams.get('time');
  const day=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2)}:00Z`;
  const arrival=new Date(Date.parse(day)-4*60000),departure=new Date(arrival.getTime()-50*60000);
  const destination=u.pathname.includes('910GWATRLMN')?'London Waterloo Rail Station':'21 PICCADILLY, Westminster (London)';
  return {ok:true,json:async()=>({journeys:[{startDateTime:departure.toISOString().replace('Z',''),arrivalDateTime:arrival.toISOString().replace('Z',''),duration:50,legs:[{mode:{id:'tube'},departurePoint:{commonName:wrongOrigin?'44 LONGFORD ROAD, Richmond':'37 LONGFORD ROAD, Richmond',lat:farOrigin?51.46:51.45,lon:-.2},arrivalPoint:{commonName:destination}}]}]})};
 };
 new Function('Deno','createClient','fetch','Response','URLSearchParams','AbortSignal','selectJourney','matchesOrigin','matchesDestination','verifiedLocation','nearLocation',code)({env:{get:()=>''},serve:f=>{handler=f}},()=>admin,fetch,Response,URLSearchParams,AbortSignal,selectJourney,matchesOrigin,matchesDestination,verifiedLocation,nearLocation);
 return {run:()=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({id})})),row:()=>row,requests:()=>requests,manual,urls};
}
test('route endpoint saves new results and preserves a manual correction',async()=>{
 const a=setup(),response=await a.run();assert.equal(response.status,200);assert.equal(a.requests(),6);
 assert.deepEqual(a.row().journey_estimates.dancelab,a.manual);
 assert.equal(a.row().journey_estimates.waterloo.minutes,50);assert.equal(a.row().journey_estimates.dilly.minutes,50);
});
test('automatically routes from an independently verified building when TfL names a different nearby point',async()=>{
 const a=setup({verified:true,wrongOrigin:true}),response=await a.run();assert.equal(response.status,200);
 assert.ok(a.urls.every(x=>x.includes('/Journey/JourneyResults/51.45%2C-0.2/to/')));
 assert.equal(a.row().journey_estimates.waterloo.origin_source,'Nominatim confirmed address');
});
test('verified coordinates do not allow a journey starting far away',async()=>{
 const a=setup({verified:true,farOrigin:true}),response=await a.run(),data=await response.json();
 assert.equal(data.errors.length,2);assert.deepEqual(Object.keys(a.row().journey_estimates),['dancelab']);
});
test('a concurrently changed verified location aborts the route save',async()=>{
 const a=setup({verified:true,geoConflict:true}),response=await a.run();
 assert.equal(response.status,409);assert.deepEqual(Object.keys(a.row().journey_estimates),['dancelab']);
});
test('concurrent route edits stop the save',async()=>{
 const a=setup({conflict:true}),response=await a.run();assert.equal(response.status,409);assert.deepEqual(Object.keys(a.row().journey_estimates),['dancelab']);
});
test('a route starting at another house is never saved',async()=>{
 const a=setup({wrongOrigin:true}),response=await a.run(),data=await response.json();
 assert.equal(data.errors.length,2);
 assert.deepEqual(Object.keys(a.row().journey_estimates),['dancelab']);
});
