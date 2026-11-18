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
 const live=await worker.evaluate(async()=>{
  const original=chrome.scripting.executeScript.bind(chrome.scripting),capture=[];
  chrome.scripting.executeScript=async options=>{const before=await original({target:options.target,func:()=>({url:location.href,title:document.title,body:document.body?.innerText?.slice(0,1200)})});const value=await original(options);capture.push({name:options.func?.name,before,results:value});return value};
  try{return {data:await extract('https://www.zoopla.co.uk/for-sale/details/72832286/')}}
  catch(error){return {error:String(error),capture}}
  finally{chrome.scripting.executeScript=original}
 });
 let source=live.data;
 if(source){
  assert.equal(source.listing_id,'72832286');assert.equal(source.extension_version,'0.19.0');
  assert.match(source.listing_text,/Off Street Parking for 2 Cars/);assert.match(source.listing_text,/driveway for two cars/);
  console.log('OUTDOOR_LIVE_IMPORT_PASS full original-listing text, off-street parking capacity, garden orientation and driveway');
 }else{
  console.log('OUTDOOR_LIVE_IMPORT_FAILURE '+JSON.stringify(live));
  const fixture=JSON.parse(await readFile(resolve(root,'tests/fixtures/central-road-listing.json'),'utf8'));
  source={floor_area_sqm:68.01,listing_text:[...fixture.features.bullets,fixture.detailedDescription].join('\n\n')};
 }
 const data=normalizeListingOutdoors(source),page=await context.newPage();
 await page.goto(origin+'/tests/fixtures/central-road-listing.json');
 const row={id:'fixture-central',address:'70 Central Rd, Morden',floor_area_sqm:data.floor_area_sqm,garden_area_sqm:null,garden_description:data.garden_description,manual_overrides:{},floors:null,bathrooms:1,wc_count:null,floorplans:[{path:'plan.jpg'}],viewing_at:'2026-12-12T12:00:00Z',comment_sabina:'Keep original comment',journey_estimates:{waterloo:{minutes:43}},station_name:'Morden',import_diagnostics:{listing_text:data.listing_text,source_values:{floor_area_sqm:data.floor_area_sqm,garden_description:data.garden_description}}};
 const result=await page.evaluate(async({origin,row})=>{
  const {analyzeFloorplan}=await import(origin+'/floorplan-ocr.js');let writes=0;
  const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(row),error:null})}),rpc:async(name,args)=>{
   if(name!=='house_hunt_save_manual_edit'||JSON.stringify(args.p_before)!==JSON.stringify(row))throw Error('Unexpected write');
   for(const key of ['viewing_at','comment_sabina','journey_estimates','station_name','manual_overrides','floorplans'])if(Object.hasOwn(args.p_patch,key))throw Error('Protected field '+key);
   Object.assign(row,structuredClone(args.p_patch));writes++;return {data:true,error:null};
  }};
  const outcome=await analyzeFloorplan({sb,property:structuredClone(row),photo:async()=>origin+'/tests/fixtures/central-road-plan.jpg',force:true});
  return {outcome,row,writes};
 },{origin,row});
 assert.equal(result.outcome.status,'saved');assert.equal(result.row.floor_area_sqm,data.floor_area_sqm);assert.equal(result.row.garden_area_sqm,95.76);
 assert.equal(result.row.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,86);
 assert.match(result.row.garden_description,/12.70 × 7.54 m/);assert.match(result.row.garden_description,/7.54 × 6.89 m/);
 assert.match(result.row.garden_description,/Off Street Parking for 2 Cars/);assert.match(result.row.garden_description,/South-East Facing Garden/);
 assert.equal(result.row.viewing_at,row.viewing_at);assert.equal(result.row.comment_sabina,row.comment_sabina);assert.deepEqual(result.row.journey_estimates,row.journey_estimates);
 console.log('OUTDOOR_REAL_OCR_PASS '+JSON.stringify({floor_area_sqm:result.row.floor_area_sqm,plan_fallback_area_sqm:result.row.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,garden_area_sqm:result.row.garden_area_sqm,notes:result.row.garden_description,fields:result.outcome.fields,fixture_writes:result.writes}));
 if(!live.data)throw Error('Live original-listing check failed; see OUTDOOR_LIVE_IMPORT_FAILURE');
}finally{await context.close();await new Promise(done=>server.close(done))}
