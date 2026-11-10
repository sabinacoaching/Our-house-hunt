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
].map(([id,address,agency_name,status],i)=>({id,address,agency_name,status,source:'Zoopla',url:'https://example.test/'+id,price:500000,bedrooms:2,bathrooms:1,latitude:null,longitude:null,sort_order:i,created_at:'2026-11-01T12:00:00Z',comment_david:'Keep decision '+id,comment_sabina:'Keep comment '+id,manual_overrides:{},images:[],floorplans:[],journey_estimates:{},station_commutes:{},import_diagnostics:{route_pending:false}}));
const transport=`export function createClient(){
 const rows=${JSON.stringify(fixtures)};window.__fixtureRows=rows;window.__fixtureWrites=[];
 return {auth:{getSession:async()=>({data:{session:{user:{id:'fixture-member'}}}}),onAuthStateChange(){}},
  rpc:async()=>({data:[],error:null}),
  from(table){let patch=null,filters=[];const api={select(){return this},order(){return this},eq(key,value){filters.push([key,value]);return this},update(value){patch=value;return this},
   then(done){const data=table==='members'?[{id:'fixture-member',display_name:'Fixture household'}]:table==='notes'?[]:rows.filter(p=>filters.every(([key,value])=>p[key]===value));
    if(patch)for(const p of data){window.__fixtureWrites.push({id:p.id,patch:structuredClone(patch)});Object.assign(p,structuredClone(patch))}
    return Promise.resolve({data:structuredClone(data),error:null}).then(done)}
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
await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith(origin))return route.continue();
 if(url.startsWith('https://esm.sh/@supabase/supabase-js@'))return route.fulfill({contentType:'text/javascript',body:transport});
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
 await menu.getByRole('button',{name:'Cancel',exact:true}).click();
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
 assert.equal(await page.locator('.hh-render-fallback').count(),0);assert.deepEqual(errors,[]);
 if(process.env.HH_UI_SCREENSHOT)await page.screenshot({path:process.env.HH_UI_SCREENSHOT,fullPage:false});
 console.log('CATALOGUE_UI_PASS agency sorting, workflow filters, independent enquiry/request, current decision, legacy preservation, archive restore');
}finally{await browser.close();await new Promise(done=>server.close(done))}
