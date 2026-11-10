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
 return {id,address,agency_name,status,source:'Zoopla',url,price:500000,bedrooms:2,bathrooms:1,latitude,longitude,sort_order:i,created_at:'2026-11-01T12:00:00Z',viewing_at:i===0?'2026-11-15T14:05:37Z':null,comment_david:'Keep decision '+id,comment_sabina:'Keep comment '+id,manual_overrides:{},images:[],floorplans:[],journey_estimates:{},station_name:'Alpha Station',station_2_name:'Beta Station',station_3_name:'Gamma Station',station_distance_miles:.5,station_2_distance_miles:.6,station_3_distance_miles:.7,station_commutes:{results:[{name:'Alpha Station',walking_minutes:10,walking_miles:.5},{name:'Beta Station',walking_minutes:15,walking_miles:.6},{name:'Gamma Station',walking_minutes:20,walking_miles:.7}],google_routes:{origin:address,stations:['Alpha Station','Beta Station','Gamma Station'],results:[{walking_minutes:10,walking_miles:.5},{walking_minutes:15,walking_miles:.6},{walking_minutes:20,walking_miles:.7}]}},import_diagnostics:{route_pending:false,source_location:{source:'listing-street-view',listing_url:url,address_input:address,latitude,longitude}}};
});
const transport=`export function createClient(){
 const rows=JSON.parse(localStorage.getItem('catalogue-fixture-rows')||'null')||${JSON.stringify(fixtures)};window.__fixtureRows=rows;window.__fixtureWrites=[];
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const equal=(a,b)=>{if(typeof b==='string'&&/^[{[]/.test(b))try{b=JSON.parse(b)}catch{}return JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null))};
 return {auth:{getSession:async()=>({data:{session:{user:{id:'fixture-member'}}}}),onAuthStateChange(){}},
  rpc:async(name,args)=>{
   if(!['house_hunt_save_google_routes','house_hunt_save_manual_edit'].includes(name))return {data:[],error:null};
   if(name==='house_hunt_save_manual_edit'&&window.__delayStationSave)await new Promise(resolve=>setTimeout(resolve,window.__delayStationSave));
   const row=rows.find(p=>p.id===args.p_id);
   if(JSON.stringify(canonical(row))!==JSON.stringify(canonical(args.p_before)))return {data:false,error:null};
   window.__fixtureWrites.push({id:row.id,patch:structuredClone(args.p_patch)});Object.assign(row,structuredClone(args.p_patch));localStorage.setItem('catalogue-fixture-rows',JSON.stringify(rows));return {data:true,error:null};
  },
  from(table){let patch=null,filters=[];const result=()=>{const data=table==='members'?[{id:'fixture-member',display_name:'Fixture household'}]:table==='notes'?[]:rows.filter(p=>filters.every(([key,value])=>equal(p[key],value)));
    if(patch){for(const p of data){window.__fixtureWrites.push({id:p.id,patch:structuredClone(patch)});Object.assign(p,structuredClone(patch))}localStorage.setItem('catalogue-fixture-rows',JSON.stringify(rows))}
    return {data:structuredClone(data),error:null}};
   const api={select(){return this},order(){return this},eq(key,value){filters.push([key,value]);return this},is(key,value){filters.push([key,value]);return this},update(value){patch=value;return this},single:async()=>{const r=result();return {...r,data:r.data[0]||null}},maybeSingle:async()=>{const r=result();return {...r,data:r.data[0]||null}},then:done=>(patch&&['station_name','station_2_name','station_3_name'].some(key=>Object.hasOwn(patch,key))?new Promise(resolve=>setTimeout(resolve,window.__delayStationSave||0)).then(result):Promise.resolve(result())).then(done)
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
const page=await browser.newPage({viewport:{width:1500,height:950},timezoneId:'Europe/London',locale:'ru-RU'}),errors=[];
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
const enterViewing=async(scope,{day,month,hours,minutes})=>{
 for(const [title,value] of [['Day',day],['Hours',hours],['Minutes',minutes]]){const input=scope.getByLabel(title,{exact:true});await input.focus();await input.pressSequentially(String(value))}
 await scope.getByLabel('Month',{exact:true}).selectOption(String(month));
};
const snapshot=async name=>{if(process.env.HH_UI_SNAPSHOT_LOG)console.log('CATALOGUE_SNAPSHOT '+name+' '+(await page.screenshot({fullPage:false})).toString('base64'))};
try{
 await page.clock.setFixedTime(new Date('2026-11-10T10:00:00Z'));
 await page.goto(origin);await page.locator('.hh-table tbody tr').first().waitFor();
 const views=page.locator('#viewControls'),appMenu=page.locator('#appMenu'),dateDialog=page.locator('.hh-viewing-dialog');
 assert.equal(await page.locator('.filters #exportExcel,.filters #exportPdf').count(),0);
 assert.equal(await page.locator('.hh-views').count(),1);
 const aligned=await page.evaluate(()=>{
  const controls=[...document.querySelectorAll('.hh-views button,#refresh,#appMenu>summary')];
  const centers=controls.map(el=>{const r=el.getBoundingClientRect();return r.top+r.height/2});
  return {spread:Math.max(...centers)-Math.min(...centers),height:document.querySelector('.top').getBoundingClientRect().height};
 });
 assert.ok(aligned.spread<=2&&aligned.height<=56,JSON.stringify(aligned));
 assert.equal(await page.locator('#exportExcel').isVisible(),false);
 await appMenu.locator('summary').click();await page.locator('#changePassword').click();
 await page.locator('#passwordDialog').waitFor({state:'visible'});
 assert.equal(await appMenu.getAttribute('open'),null);
 await page.locator('#closePasswordDialog').click();
 await appMenu.locator('summary').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportExcel').click()]);
 assert.ok(download.suggestedFilename().endsWith('.xlsx'));
 await appMenu.locator('summary').click();
 const [pdf]=await Promise.all([page.waitForEvent('popup'),page.locator('#exportPdf').click()]);
 await pdf.waitForFunction(()=>document.body?.textContent.includes('Alpha Road'));await pdf.close();
 await appMenu.locator('summary').click();await page.keyboard.press('Escape');assert.equal(await appMenu.getAttribute('open'),null);
 await views.getByRole('button',{name:'Cards',exact:true}).click();assert.equal(await page.locator('#cards').isVisible(),true);
 await views.getByRole('button',{name:'Map',exact:true}).click();assert.equal(await page.locator('.hh-map').isVisible(),true);
 await views.getByRole('button',{name:'Table',exact:true}).click();
 const dateButton=()=>page.getByRole('button',{name:'Viewing date Alpha Road',exact:true});
 assert.equal(await dateButton().innerText(),'15 Nov\n14:05');
 await dateButton().click();
 assert.equal(await dateDialog.getByLabel('Day',{exact:true}).inputValue(),'15');
 assert.equal(await dateDialog.getByLabel('Month',{exact:true}).inputValue(),'11');
 assert.equal(await dateDialog.getByLabel('Hours',{exact:true}).inputValue(),'14');
 assert.equal(await dateDialog.getByLabel('Minutes',{exact:true}).inputValue(),'05');
 assert.deepEqual(await dateDialog.locator('label').evaluateAll(labels=>labels.map(label=>label.childNodes[0].textContent)),['Day','Month','Hours','Minutes']);
 assert.equal(await page.locator('input[type=datetime-local]').count(),0);
 await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fixtureRows[0].viewing_at),'2026-11-15T14:05:37Z','Cancelling retains the exact saved timestamp');
 await dateButton().click();
 await enterViewing(dateDialog,{day:12,month:12,hours:12,minutes:'02'});
 await snapshot('viewing-editor-december');
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows[0].viewing_at==='2026-12-12T12:02:00.000Z');
 await page.locator('#refresh').click();assert.equal(await dateButton().innerText(),'12 Dec\n12:02');
 await page.reload();await page.locator('.hh-table tbody tr').first().waitFor();
 assert.equal(await dateButton().innerText(),'12 Dec\n12:02');
 await dateButton().click();
 assert.equal(await dateDialog.getByLabel('Minutes',{exact:true}).inputValue(),'02');
 await enterViewing(dateDialog,{day:31,month:4,hours:12,minutes:'02'});
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 assert.match(await dateDialog.locator('.hh-date-error').innerText(),/April has 30 days/);
 assert.equal(await page.evaluate(()=>window.__fixtureRows[0].viewing_at),'2026-12-12T12:02:00.000Z','An impossible date must not overwrite the saved viewing');
 await dateDialog.getByLabel('Day',{exact:true}).fill('');
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 assert.match(await dateDialog.locator('.hh-date-error').innerText(),/Enter day, month, hours and minutes/);
 await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await dateButton().click();await dateDialog.getByRole('button',{name:'Clear date',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows[0].viewing_at===null);assert.equal(await dateButton().innerText(),'Set date');
 console.log('VIEWING_DATE_UI_PASS typed 12 December 12:02, Save/Refresh/reopen, Russian browser locale, no year/seconds/native datetime, impossible/partial validation, clear/cancel');
 await page.evaluate(()=>{window.scrollTo(0,0);const shell=document.querySelector('.hh-table-shell');shell.scrollTop=0;shell.scrollLeft=0});
 await snapshot('desktop-top');
 const shell=page.locator('.hh-table-shell'),rect=await shell.boundingBox();
 await page.mouse.move(650,Math.min(800,rect.y+130));await page.mouse.wheel(0,rect.y+130);
 await page.waitForFunction(()=>document.querySelector('.hh-table thead th').getBoundingClientRect().top<=2&&document.querySelector('.hh-table-shell').scrollTop>20);
 const scroll=await page.evaluate(()=>{
  const table=document.querySelector('.hh-table-shell'),heading=document.querySelector('.hh-table thead th'),date=document.querySelector('.hh-table th:nth-child(13)');
  return {headingTop:heading.getBoundingClientRect().top,height:table.getBoundingClientRect().height,viewport:innerHeight,inner:table.scrollTop,font:getComputedStyle(heading).fontSize,headingHeight:heading.getBoundingClientRect().height,dateWidth:date.getBoundingClientRect().width};
 });
 assert.ok(Math.abs(scroll.headingTop)<=2&&Math.abs(scroll.height-scroll.viewport)<=1,JSON.stringify(scroll));
 assert.equal(scroll.font,'14px');assert.ok(scroll.headingHeight<=68&&scroll.dateWidth<=125,JSON.stringify(scroll));
 await page.mouse.wheel(0,180);await page.waitForFunction(inner=>document.querySelector('.hh-table-shell').scrollTop>inner,scroll.inner);
 assert.ok(Math.abs((await page.locator('.hh-table thead th').first().boundingBox()).y)<=2);
 await snapshot('column-headings');
 await page.mouse.move(4,400);await page.mouse.wheel(0,-2000);
 await page.waitForFunction(()=>window.scrollY===0);
 assert.ok(await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollTop>0),'Scrolling the page outside the table must preserve its own scroll');
 await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollTop=0);
 await page.setViewportSize({width:1280,height:800});
 assert.ok(await page.evaluate(()=>{
  const elements=[...document.querySelectorAll('.hh-views button,#refresh,#appMenu>summary')],centers=elements.map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2});
  return Math.max(...centers)-Math.min(...centers)<=2;
 }),'Desktop toolbar stays on one row');
 await snapshot('desktop-1280');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile controls must not widen the whole page');
 await appMenu.locator('summary').click();
 assert.ok((await page.locator('.hh-app-menu-items').boundingBox()).x>=0);
 await snapshot('mobile-menu');await page.keyboard.press('Escape');
 await page.setViewportSize({width:1500,height:950});
 await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('.hh-table-shell').scrollLeft=0});
 console.log('COMPACT_UI_PASS top toolbar, menu exports/password, short editable date, outer/inner wheel scrolling, 14px headings, narrow date, responsive layout');
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
 await enterViewing(page.locator('#editViewing'),{day:12,month:12,hours:12,minutes:'02'});
 await page.locator('#editPrice').fill('505000');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureWrites.some(x=>x.id==='legacy'&&x.patch.price===505000));
 assert.equal(await page.evaluate(()=>window.__fixtureRows.find(p=>p.id==='legacy').viewing_at),'2026-12-12T12:02:00.000Z');
 await legacy.getByRole('button',{name:'Details',exact:true}).click();await page.locator('#editPrice').fill('506000');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='legacy').price===506000);
 assert.equal(await page.evaluate(()=>window.__fixtureRows.find(p=>p.id==='legacy').viewing_at),'2026-12-12T12:02:00.000Z');
 console.log('VIEWING_DATE_DETAILS_PASS same day/month/HH:mm editor saves, preserves date on unrelated edits');
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

 await page.evaluate(()=>{window.__failNextWalk=true;window.__delayStationSave=100});
 await alphaRow().getByLabel('Station 2',{exact:true}).fill('Example tram');
 await page.locator('#refresh').click();
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
