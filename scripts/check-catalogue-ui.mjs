// Exercise the production page and its real DOM with a fixture household.
// Database/auth transport is local; this never reads or writes owner records.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const fixtures=[
 ['alpha','Alpha Road','Oakhill','interested'],
 ['beta','Beta Road','Foxtons','enquire_viewing'],
 ['gamma','Gamma Road','foxtons','requested_viewing'],
 ['legacy','Legacy Road',null,'shortlisted'],
 ['offer','Offer Road','Chase Buchanan','under_offer_sold'],
 ['archive','Archive Road','Oakhill','archived']
].map(([id,address,agency_name,status],i)=>{
 const latitude=51.3694953+i*.001,longitude=-.0883864,url='https://example.test/'+id;
 return {id,address,agency_name,status,source:'Zoopla',url,price:500000,bedrooms:2,bathrooms:1,latitude,longitude,sort_order:i,created_at:'2026-11-01T12:00:00Z',comment_david:'Keep decision '+id,comment_sabina:'Keep comment '+id,manual_overrides:{},images:[],floorplans:[],journey_estimates:{},station_name:'Alpha Station',station_2_name:'Beta Station',station_3_name:'Gamma Station',station_distance_miles:.5,station_2_distance_miles:.6,station_3_distance_miles:.7,station_commutes:{results:[{name:'Alpha Station',walking_minutes:10,walking_miles:.5},{name:'Beta Station',walking_minutes:15,walking_miles:.6},{name:'Gamma Station',walking_minutes:20,walking_miles:.7}],google_routes:{origin:address,stations:['Alpha Station','Beta Station','Gamma Station'],results:[{walking_minutes:10,walking_miles:.5},{walking_minutes:15,walking_miles:.6},{walking_minutes:20,walking_miles:.7}]}},import_diagnostics:{route_pending:false,source_location:{source:'listing-street-view',listing_url:url,address_input:address,latitude,longitude}}};
});
const transport=`export function createClient(){
 const rows=JSON.parse(localStorage.getItem('catalogue-fixture-rows')||'null')||${JSON.stringify(fixtures)};window.__fixtureRows=rows;window.__fixtureWrites=[];
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const equal=(a,b)=>{if(typeof b==='string'&&/^[{[]/.test(b))try{b=JSON.parse(b)}catch{}return JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null))};
 return {auth:{getSession:async()=>({data:{session:{user:{id:'fixture-member'}}}}),onAuthStateChange(){}},
  rpc:async()=>({data:[],error:null}),
  from(table){let patch=null,filters=[];const result=()=>{const data=table==='members'?[{id:'fixture-member',display_name:'Fixture household'}]:table==='notes'?[]:rows.filter(p=>filters.every(([key,value])=>equal(p[key],value)));
    if(patch){for(const p of data){window.__fixtureWrites.push({id:p.id,patch:structuredClone(patch)});Object.assign(p,structuredClone(patch))}localStorage.setItem('catalogue-fixture-rows',JSON.stringify(rows))}
    return {data:structuredClone(data),error:null}};
   const api={select(){return this},order(){return this},eq(key,value){filters.push([key,value]);return this},is(key,value){filters.push([key,value]);return this},update(value){patch=value;return this},single:async()=>{const r=result();return {...r,data:r.data[0]||null}},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]||null}},then:done=>Promise.resolve(result()).then(done)
  };return api}
 }
}`;
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403);res.end();return}
  const body=await readFile(path),type={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type});res.end(body);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.HH_CHROMIUM_EXECUTABLE?{executablePath:process.env.HH_CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.addInitScript(()=>{
 window.__extensionCalls=[];
 window.addEventListener('message',event=>{
  const request=event.data;if(request?.source!=='our-house-hunt-site')return;
  let data,ok=true,error;
  if(request.action==='PING')data={version:'0.18.0'};
  else if(request.action==='GOOGLE_ROUTE'){
   const {route}=request;window.__extensionCalls.push(route);
   const fail=route.kind==='station_walk'?'__failNextWalk':'__failNextTransit';
   if(window[fail]){window[fail]=false;ok=false;error='test pause'}
   else{
    const common={source:'Google Maps',origin:route.origin.lat+','+route.origin.lon,destination:route.destination.query,station_id:route.destination.station_id,url:'https://www.google.com/maps/route'};
    data=route.kind==='station_walk'?{...common,walking_miles:.3,walking_minutes:7}:{...common,minutes:8,date:'2026-11-17',departure:'2026-11-17T07:30:00',arrival:'2026-11-17T07:38:00'};
   }
  }else{ok=false;error='Unexpected extension action '+request.action}
  window.postMessage({source:'our-house-hunt-extension',id:request.id,ok,data,error},location.origin);
 });
});
await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith(origin))return route.continue();
 if(url.startsWith('https://esm.sh/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:transport});
 if(url.startsWith('https://api.tfl.gov.uk/StopPoint/Search/')){
  const name=decodeURIComponent(new URL(url).pathname.split('/Search/')[1]);
  return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({matches:[{id:'940GZZCR'+name.replace(/\W/g,''),name:name+' Tram Stop',lat:51.375,lon:-.08}]})});
 }
 if(url.endsWith('.css'))return route.fulfill({contentType:'text/css',body:''});
 return route.abort();
});
const addresses=()=>page.locator('.hh-table tbody .hh-address').allTextContents();
try{
 await page.goto(origin);await page.locator('.hh-table tbody tr').first().waitFor();
 assert.equal(await page.locator('.hh-table thead th').nth(10).innerText(),'Current decision');
 assert.equal((await addresses()).length,5);
 assert.equal(await page.getByLabel('comment_david Alpha Road',{exact:true}).inputValue(),'Keep decision alpha');
 await page.locator('#sort').selectOption('agency_asc');
 assert.deepEqual(await addresses(),['Offer Road','Beta Road','Gamma Road','Alpha Road','Legacy Road']);
 await page.locator('#sort').selectOption('agency_desc');
 assert.deepEqual(await addresses(),['Alpha Road','Beta Road','Gamma Road','Offer Road','Legacy Road']);

 await page.locator('th').filter({hasText:'Viewing status'}).getByRole('button',{name:'Filter'}).click();
 const menu=page.locator('.hh-status-filter-menu:visible');
 const choices=await menu.locator('input[type=checkbox]').evaluateAll(inputs=>inputs.map(input=>input.value));
 assert.ok(choices.includes('enquire_viewing'));assert.ok(choices.includes('requested_viewing'));assert.ok(choices.includes('under_offer'));
 assert.ok(!choices.some(value=>['shortlisted','sold','under_offer_sold'].includes(value)));
 await menu.getByRole('button',{name:'All statuses',exact:true}).click();
 await menu.getByRole('button',{name:'Apply',exact:true}).click();
 assert.equal((await addresses()).length,6,'All statuses must retain legacy Shortlisted houses');
 await page.locator('#stageFilter').selectOption('under_offer');assert.deepEqual(await addresses(),['Offer Road']);
 assert.equal(await page.getByLabel('status Offer Road',{exact:true}).inputValue(),'under_offer_sold');
 await page.locator('#stageFilter').selectOption('all');
 await page.getByLabel('status Alpha Road',{exact:true}).selectOption('enquire_viewing');
 await page.waitForFunction(()=>window.__fixtureWrites.some(x=>x.id==='alpha'&&x.patch.status==='enquire_viewing'));
 await page.locator('#stageFilter').selectOption('enquire_viewing');
 assert.deepEqual((await addresses()).sort(),['Alpha Road','Beta Road']);
 await page.getByLabel('comment_david Alpha Road',{exact:true}).fill('New current decision');
 await page.getByLabel('comment_david Alpha Road',{exact:true}).press('Tab');
 await page.waitForFunction(()=>window.__fixtureWrites.some(x=>x.patch.comment_david==='New current decision'));

 await page.locator('#stageFilter').selectOption('all');
 const legacy=page.locator('.hh-table tbody tr').filter({hasText:'Legacy Road'});
 await legacy.getByRole('button',{name:'Details',exact:true}).click();
 assert.equal(await page.locator('#editStage').inputValue(),'shortlisted');
 assert.equal(await page.locator('#editStage option:checked').innerText(),'Shortlisted');
 await page.locator('#editPrice').fill('505000');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureWrites.some(x=>x.id==='legacy'&&x.patch.price===505000));
 assert.equal(await page.getByLabel('status Legacy Road',{exact:true}).inputValue(),'shortlisted');

 await page.locator('#stageFilter').selectOption('archived');
 assert.deepEqual(await addresses(),['Archive Road']);
 await page.getByRole('button',{name:'Restore to active',exact:true}).first().click();
 await page.waitForFunction(()=>window.__fixtureRows.find(x=>x.id==='archive').status==='');
 await page.locator('#stageFilter').selectOption('all');assert.equal((await addresses()).length,6);

 const alphaRow=()=>page.locator('.hh-table tbody tr').filter({hasText:'Alpha Road'});
 await alphaRow().getByLabel('Station 3',{exact:true}).fill('Lebanon Road');
 await alphaRow().getByLabel('Station 3',{exact:true}).press('Tab');
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').station_commutes.manual_routes?.station_3_name?.state==='complete');
 assert.match(await alphaRow().locator('.hh-station-entry').nth(2).innerText(),/7 min/);
 assert.equal(await page.evaluate(()=>window.__extensionCalls.length),2);

 await page.evaluate(()=>{window.__failNextWalk=true});
 await alphaRow().getByLabel('Station 2',{exact:true}).fill('Example tram');
 await alphaRow().getByLabel('Station 2',{exact:true}).press('Tab');
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').station_commutes.manual_routes?.station_2_name?.error==='test pause');
 assert.doesNotMatch(await alphaRow().locator('.hh-station-entry').nth(1).innerText(),/15 min/);
 await alphaRow().locator('.hh-station-walk').nth(1).click();
 assert.equal(await page.getByLabel('Minutes to Example tram',{exact:true}).inputValue(),'');
 await alphaRow().locator('.hh-route-cancel').click();
 await page.locator('#refresh').click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').station_commutes.manual_routes?.station_2_name?.state==='complete');

 await page.evaluate(()=>{window.__failNextTransit=true});
 await alphaRow().getByLabel('Station 1',{exact:true}).fill('Park tram');
 await alphaRow().getByLabel('Station 1',{exact:true}).press('Tab');
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').station_commutes.manual_routes?.station_name?.error==='test pause');
 await page.reload();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').station_commutes.manual_routes?.station_name?.state==='complete');
 assert.deepEqual(await page.evaluate(()=>window.__extensionCalls.map(route=>route.kind)),['station_transit']);

 await page.locator('.hh-table tbody tr').filter({hasText:'Beta Road'}).getByRole('button',{name:'Details',exact:true}).click();
 await page.getByLabel('Nearest station 3',{exact:true}).fill('Lebanon Road');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='beta').station_commutes.manual_routes?.station_3_name?.state==='complete');
 assert.equal(await page.evaluate(()=>window.__fixtureRows.find(p=>p.id==='gamma').station_3_name),'Gamma Station');
 assert.equal(await page.locator('.hh-render-fallback').count(),0);assert.deepEqual(errors,[]);
 if(process.env.HH_UI_SCREENSHOT)await page.screenshot({path:process.env.HH_UI_SCREENSHOT,fullPage:false});
 console.log('CATALOGUE_UI_PASS agency sorting, workflow filters, independent enquiry/request, current decision, legacy preservation, archive restore');
 console.log('MANUAL_STATION_UI_PASS inline rename, detail rename, automatic walking/PT, Refresh retry, reopen resumes only missing component');
}finally{await browser.close();await new Promise(done=>server.close(done))}
