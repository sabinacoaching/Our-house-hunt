// Real MV3 extraction + actual browser Tesseract OCR. All database writes are fixtures.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {normalizeListingOutdoors} from '../outdoor-details.js';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),extension=resolve(root,'extension');
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith(root+'/'))throw Error('Outside root');
  const content=await readFile(path);res.writeHead(200,{'content-type':{'.js':'text/javascript','.jpg':'image/jpeg','.json':'application/json'}[extname(path)]||'text/plain'});res.end(content);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,locale:'en-GB',timezoneId:'Europe/London',args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
try{
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 await context.pages()[0].bringToFront();
 // Own the fixture tab before navigation, so Playwright intercepts its first
 // request. The listing reader still runs through real Chrome scripting APIs
 // in an inactive tab, using the exact distributed extension function.
 const readCaptured=async(url,html)=>{
  const fixtureTab=await context.newPage();
  try{
   await fixtureTab.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await fixtureTab.goto(url);
   await context.pages()[0].bringToFront();
   return await worker.evaluate(async url=>{
    const tabs=await chrome.tabs.query({}),tab=tabs.find(x=>x.url===url);if(!tab)throw Error('Native fixture tab missing');
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readPropertyFromPage});const data=result?.[0]?.result;
    if(!data||data.read_error)throw Error(data?.read_error||'Native fixture reader returned no data');return data;
   },url);
  }finally{await fixtureTab.close()}
 };

 const live=await worker.evaluate(async()=>{
  const original=chrome.scripting.executeScript.bind(chrome.scripting),capture=[];
  chrome.scripting.executeScript=async options=>{const before=await original({target:options.target,func:()=>({url:location.href,title:document.title,body:document.body?.innerText?.slice(0,1200)})});const value=await original(options);capture.push({name:options.func?.name,before,results:value});return value};
  try{return {data:await extract('https://www.zoopla.co.uk/for-sale/details/72832286/')}}
  catch(error){return {error:String(error),capture}}
  finally{chrome.scripting.executeScript=original}
 });
 let source=live.data;
 if(source){
  assert.equal(source.listing_id,'72832286');assert.equal(source.extension_version,'0.20.0');
  assert.match(source.listing_text,/Off Street Parking for 2 Cars/);assert.match(source.listing_text,/driveway for two cars/);
  console.log('OUTDOOR_LIVE_IMPORT_PASS full original-listing text, off-street parking capacity, garden orientation and driveway');
 }else{
  console.log('OUTDOOR_LIVE_IMPORT_FAILURE '+JSON.stringify(live));
  const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/central-road-listing.json'),'utf8'));
  if(!live.capture?.some(x=>x.before?.some(v=>/security verification|cloudflare|not a bot/i.test(v.result?.body||''))))throw Error(live.error);
  const payload='7d:'+JSON.stringify(['$','div',null,{children:fixture}])+'\n';
  const html='<html><head><title>3 bedroom house for sale Central Road, Morden SM4</title></head><body><h1>3 bedroom house for sale Central Road, Morden SM4</h1><p>£525,000</p><p>3 bedroom house</p><script>self.__next_f={push(){}};self.__next_f.push('+JSON.stringify([1,payload])+')</script></body></html>';
  source=await readCaptured('https://www.zoopla.co.uk/for-sale/details/72832286/',html);
  assert.match(source.listing_text,/Off Street Parking for 2 Cars/);assert.match(source.listing_text,/driveway for two cars/);
  console.log('OUTDOOR_MV3_CAPTURED_SOURCE_PASS native extension reads original-listing source captured on 18 November; live runner blocked by Cloudflare');
 }
 const data=normalizeListingOutdoors(source),page=await context.newPage();
 await page.goto(origin+'/tests/fixtures/central-road-listing.json');
 const row={id:'fixture-central',address:'70 Central Rd, Morden',floor_area_sqm:data.floor_area_sqm,garden_area_sqm:null,garden_description:data.garden_description,manual_overrides:{},floors:null,bathrooms:1,wc_count:null,floorplans:[{path:'plan.jpg'}],viewing_at:'2026-12-12T12:00:00Z',comment_sabina:'Keep original comment',journey_estimates:{waterloo:{minutes:43}},station_name:'Morden',import_diagnostics:{listing_text:data.listing_text,source_values:{floor_area_sqm:data.floor_area_sqm,garden_description:data.garden_description}}};
 const result=await page.evaluate(async({origin,row})=>{
  const {analyzeFloorplan,readPlanImage}=await import(origin+'/floorplan-ocr.js');let writes=0;
  const recognized=await readPlanImage(await (await fetch(origin+'/tests/fixtures/central-road-plan.jpg')).blob());
  console.log('OUTDOOR_OCR_TEXT '+JSON.stringify(recognized));
  const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(row),error:null})}),rpc:async(name,args)=>{
   if(name!=='house_hunt_save_manual_edit'||JSON.stringify(args.p_before)!==JSON.stringify(row))throw Error('Unexpected write');
   for(const key of ['viewing_at','comment_sabina','journey_estimates','station_name','manual_overrides','floorplans'])if(Object.hasOwn(args.p_patch,key))throw Error('Protected field '+key);
   Object.assign(row,structuredClone(args.p_patch));writes++;return {data:true,error:null};
  }};
  const outcome=await analyzeFloorplan({sb,property:structuredClone(row),photo:async()=>origin+'/tests/fixtures/central-road-plan.jpg',recognize:async()=>recognized,force:true});
  return {outcome,row,writes,recognized};
 },{origin,row});
 console.log('OUTDOOR_OCR_TEXT '+JSON.stringify(result.recognized));
 assert.equal(result.outcome.status,'saved');assert.equal(result.row.floor_area_sqm,data.floor_area_sqm);assert.equal(result.row.garden_area_sqm,95.76);
 assert.equal(result.row.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,86);
 assert.match(result.row.garden_description,/12.70 × 7.54 m/);assert.match(result.row.garden_description,/7.54 × 6.89 m/);
 assert.match(result.row.garden_description,/Off Street Parking for 2 Cars/);assert.match(result.row.garden_description,/South-East Facing Garden/);
 assert.equal(result.row.viewing_at,row.viewing_at);assert.equal(result.row.comment_sabina,row.comment_sabina);assert.deepEqual(result.row.journey_estimates,row.journey_estimates);
 console.log('OUTDOOR_REAL_OCR_PASS '+JSON.stringify({floor_area_sqm:result.row.floor_area_sqm,plan_fallback_area_sqm:result.row.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,garden_area_sqm:result.row.garden_area_sqm,notes:result.row.garden_description,fields:result.outcome.fields,fixture_writes:result.writes}));
 const regressions=JSON.parse(await readFile(resolve(root,'tests/fixtures/outdoor-regressions.json'),'utf8'));
 for(const fixture of regressions){
  const listing={listingId:fixture.listing_id,displayAddress:fixture.address,propertyImage:[{filename:'source-photo.jpg'}],floorPlan:{image:[{filename:'source-plan.jpg'}]},location:{coordinates:fixture.point},features:{bullets:[]},detailedDescription:'$d0'};
  const text=fixture.listing_text,flight=':HL["style"]\n'+'d0:T'+Buffer.byteLength(text).toString(16)+','+text+'d1:'+JSON.stringify(['$','div',null,{children:listing}])+'\n';
  const url='https://www.zoopla.co.uk/for-sale/details/'+fixture.listing_id+'/';
  const html='<html><head><title>3 bedroom house for sale '+fixture.address+'</title></head><body><h1>3 bedroom house for sale '+fixture.address+'</h1><p>£550,000</p><script>self.__next_f={push(){}};self.__next_f.push('+JSON.stringify([1,flight])+')</script></body></html>';
  const source=await readCaptured(url,html);assert.equal(source.address,fixture.address);assert.equal(source.location_hint.source,'listing-map');assert.match(source.listing_text,/garden/i);assert.doesNotMatch(source.listing_text,/\$d0/);
  const checked=await page.evaluate(async({origin,fixture,source})=>{
   const {readPlanImage,parsePlanText}=await import(origin+'/floorplan-ocr.js');
   const {outdoorChanges,needsOutdoorRefresh}=await import(origin+'/outdoor-refresh.js');
   const recognized=await readPlanImage(await (await fetch(origin+'/tests/fixtures/'+fixture.image)).blob());
   const measurements=parsePlanText([recognized.text,recognized.headerText,recognized.footerText].join('\n'),recognized);
   const old='rear garden EPC Rating D attractive three-bedroom house';
   const p={id:fixture.name,address:source.address,url:'https://www.zoopla.co.uk/for-sale/details/'+fixture.listing_id,garden_area_sqm:null,garden_description:old,floorplans:[{path:fixture.image}],manual_overrides:{},viewing_at:'2026-12-12T12:11:37Z',comment_sabina:'Keep owner comment',journey_estimates:{waterloo:{minutes:42}},import_diagnostics:{source_values:{garden_description:old}}};
   const patch=outdoorChanges(p,{listingText:source.listing_text,measurements:[measurements]});
   return {recognized,measurements,patch,needsRefresh:needsOutdoorRefresh({...p,...patch})};
  },{origin,fixture,source});
  console.log('OUTDOOR_REGRESSION_OCR '+JSON.stringify({name:fixture.name,...checked}));
  assert.equal(checked.patch.garden_area_sqm??null,fixture.expected_area,fixture.name+' garden area');
  assert.equal(checked.needsRefresh,false);assert.doesNotMatch(checked.patch.garden_description,/EPC|three-bedroom/);
  if(fixture.name==='southbrook'){assert.match(checked.patch.garden_description,/17.39 × 6.99 m/);assert.match(checked.patch.garden_description,/Parking: On street/)}
  if(fixture.name==='elmfield')assert.match(checked.patch.garden_description,/26.70 × 3.71 m/);
  if(fixture.name==='woodvale'){assert.match(checked.patch.garden_description,/8.00 × 6.50 m/);assert.match(checked.patch.garden_description,/front/i)}
  if(fixture.name==='beecholme')assert.match(checked.patch.garden_description,/Off street parking and garage/);
  for(const key of ['viewing_at','comment_sabina','journey_estimates','address','manual_overrides'])assert.equal(Object.hasOwn(checked.patch,key),false);
  console.log('OUTDOOR_REGRESSION_PASS '+fixture.name+' '+JSON.stringify({area:checked.patch.garden_area_sqm??null,notes:checked.patch.garden_description,map:source.location_hint}));
 }
}finally{await context.close();await new Promise(done=>server.close(done))}
