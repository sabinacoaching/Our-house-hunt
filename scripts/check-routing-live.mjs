// Runs production routing modules and the extension's exact page reader against
// public TfL and Google Maps. Supabase reads/writes are emulated in memory.
import {chromium} from 'playwright-core';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {calculateGoogleRoutes} from '../google-routes-runner.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const metadata=read('../server/house-hunt-station-commutes/station-discovery.ts').replace(/^export /gm,'');
const edge=read('../server/house-hunt-station-commutes/index.ts').replace(/^import .*;\s*$/gm,'');
const edgeCode=stripTypeScriptTypes(metadata+'\n'+edge,{mode:'strip'});
const pageScript=read('../extension/google-route-page.js');
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const pages=new Map();let nextTab=0;
const chrome={tabs:{create:async({url})=>{const id=++nextTab,page=await browser.newPage({locale:'en-GB',timezoneId:'Europe/London'});pages.set(id,page);await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});return {id}},get:async()=>({status:'complete'}),remove:async id=>{await pages.get(id)?.close();pages.delete(id)},onUpdated:{addListener(){},removeListener(){}}},runtime:{onMessage:{addListener(){}}},scripting:{executeScript:async({target,args})=>[{result:await pages.get(target.tabId).evaluate(async({script,request})=>{const run=new Function(script+';return houseHuntReadMapsPage')();return run(request)},{script:pageScript,request:args[0]})}]}};
const extensionContext=vm.createContext({chrome,URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,console});
vm.runInContext(read('../extension/google-route-parser.js'),extensionContext);vm.runInContext(pageScript,extensionContext);vm.runInContext(read('../extension/background.js'),extensionContext);
try{
 for(const [address,listing,latitude,longitude] of [['Alpine Close','74553564',51.3694953,-.0883864],['Lyncroft Gardens','73674598',51.4631369,-.3552057],['Rossindel Road','73709933',51.4621708,-.3708626]]){
  const id='00000000-0000-4000-8000-000000000001',url='https://www.zoopla.co.uk/for-sale/details/'+listing;
  let row={id,url,address,latitude,longitude,manual_overrides:{},journey_estimates:{},station_commutes:{},station_name:'',station_2_name:'',station_3_name:null,import_diagnostics:{route_pending:true,source_location:{source:'listing-street-view',listing_url:url,address_input:address,latitude,longitude}}},writes=0,requests=0,handler;
  const admin={auth:{getUser:async()=>({data:{user:{id:'test'}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:row}),maybeSingle:async()=>({data:{id:'test'}}),update(){throw Error('Live test must not write to Supabase')}})};
  new Function('Deno','createClient','fetch',edgeCode)({env:{get:()=>''},serve:fn=>handler=fn},()=>admin,async(...args)=>{requests++;return fetch(...args)});
  const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(row)})}),functions:{invoke:async(_name,{body})=>{const response=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify(body)}));return response.ok?{data:await response.json()}:{error:{message:'non-2xx',context:response}}}},rpc:async(_name,args)=>{assert.deepEqual(args.p_before,row);row={...row,...structuredClone(args.p_patch)};writes++;return {data:true}}};
  const start=Date.now(),calls=[];
  try{
   await calculateGoogleRoutes(id,{sb,extension:async(action,{route})=>{assert.equal(action,'GOOGLE_ROUTE');calls.push(route.kind);return structuredClone(await extensionContext.googleRoute(route))},progress:message=>console.log('PROGRESS '+message),delay:async()=>{}});
   assert.equal(row.import_diagnostics.route_pending,false);assert.equal(Object.keys(row.journey_estimates).length,3);
   const before=calls.length;await calculateGoogleRoutes(id,{sb,extension:async()=>{throw Error('Completed home must not recalculate')}});assert.equal(calls.length,before);
   console.log('LIVE_RESULT '+JSON.stringify({address,complete:true,ms:Date.now()-start,requests,writes,calls,journeys:row.journey_estimates,stations:row.station_commutes.google_routes,entrances:row.station_commutes.tfl_final.results}));
  }catch(error){process.exitCode=1;console.log('LIVE_RESULT '+JSON.stringify({address,complete:false,ms:Date.now()-start,requests,writes,calls,error:String(error),errors:row.import_diagnostics.google_routes_work?.errors,journeys:row.journey_estimates,stations:row.station_commutes.google_routes}))}
 }
}finally{await browser.close()}
