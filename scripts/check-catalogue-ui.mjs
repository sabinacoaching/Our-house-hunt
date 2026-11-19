// Exercise the production page and its real DOM with a fixture household.
// Database/auth transport is local; this never reads or writes owner records.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const outdoorNote='Rear garden: lawn, mature borders, patio and pedestrian side access.\nFront garden: planted flower beds and a path to the entrance.\nOff-street parking for two cars on the driveway.\nResidents permit parking on the road.\nGarden (floor plan): 12.70 × 7.54 m; approximately 95.76 m².\nDriveway (floor plan): 7.54 × 6.89 m; approximately 51.95 m².';
const fixtures=[
 ['alpha','Alpha Road','Oakhill','interested'],
 ['beta','Beta Road','Foxtons','enquire_viewing'],
 ['gamma','Gamma Road','foxtons','requested_viewing'],
 ['legacy','Legacy Road',null,'shortlisted'],
 ['offer','Offer Road','Chase Buchanan','under_offer_sold'],
 ['archive','Archive Road','Oakhill','archived']
].map(([id,address,agency_name,status],i)=>{
 const latitude=51.3694953+i*.001,longitude=-.0883864,url='https://example.test/'+id;
 return {id,address,agency_name,status,source:'Zoopla',url,price:500000,bedrooms:2,bathrooms:1,latitude,longitude,sort_order:i,created_at:'2026-11-01T12:00:00Z',viewing_at:['2026-11-15T14:05:37Z','2026-12-01T12:11:22Z','2027-01-12T09:00:17Z','2026-06-01T13:05:19Z','2026-11-14T10:30:13Z','2026-10-10T16:15:11Z'][i],comment_david:'Keep decision '+id,comment_sabina:'Keep comment '+id,manual_overrides:{},images:[],floorplans:[],garden_description:i===0?outdoorNote:'',journey_estimates:{},station_name:'Alpha Station',station_2_name:'Beta Station',station_3_name:'Gamma Station',station_distance_miles:.5,station_2_distance_miles:.6,station_3_distance_miles:.7,station_commutes:{results:[{name:'Alpha Station',walking_minutes:10,walking_miles:.5},{name:'Beta Station',walking_minutes:15,walking_miles:.6},{name:'Gamma Station',walking_minutes:20,walking_miles:.7}],google_routes:{origin:address,stations:['Alpha Station','Beta Station','Gamma Station'],results:[{walking_minutes:10,walking_miles:.5},{walking_minutes:15,walking_miles:.6},{walking_minutes:20,walking_miles:.7}]}},import_diagnostics:{route_pending:false,source_location:{source:'listing-street-view',listing_url:url,address_input:address,latitude,longitude}}};
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
  if(request.action==='PING')data={extension:'Our House Hunt',version:window.__outdoorFixture?'0.20.0':'0.18.0'};
  else if(request.action==='IMPORT_URL'&&window.__holdImport)return;
  else if(request.action==='IMPORT_URL'&&window.__outdoorFixture)data={listing_text:'Rear garden 12.0m x 5.0m\n\nOff-street parking for two cars.'};
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
const enterViewing=async(scope,{day,month,time,hours,minutes})=>{
 const names=['January','February','March','April','May','June','July','August','September','October','November','December'],target=names[Number(month)-1];
 for(let step=0;step<12&&(await scope.locator('.hh-calendar-head strong').innerText())!==target;step++)await scope.getByRole('button',{name:'Next month',exact:true}).click();
 assert.equal(await scope.locator('.hh-calendar-head strong').innerText(),target);
 await scope.getByRole('button',{name:day+' '+target,exact:true}).click();
 const input=scope.getByLabel('Time',{exact:true});
 assert.equal(await input.evaluate(el=>el===document.activeElement),true,'Picking a calendar day focuses the single time field');
 await input.pressSequentially(time??String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0'));
};
const snapshot=async name=>{if(process.env.HH_UI_SNAPSHOT_LOG)console.log('CATALOGUE_SNAPSHOT '+name+' '+(await page.screenshot({fullPage:false})).toString('base64'))};
try{
 await page.clock.setFixedTime(new Date('2026-11-10T10:00:00Z'));
 await page.goto(origin);await page.locator('.hh-table tbody tr').first().waitFor();
 const outdoor=page.getByLabel('garden_description Alpha Road',{exact:true});assert.equal(await outdoor.inputValue(),outdoorNote);
 assert.equal(await outdoor.evaluate(el=>getComputedStyle(el).resize),'vertical');
 await outdoor.scrollIntoViewIfNeeded();
 const gardenBox=await outdoor.boundingBox();
 await page.mouse.move(gardenBox.x+gardenBox.width-4,gardenBox.y+gardenBox.height-4);await page.mouse.down();await page.mouse.move(gardenBox.x+gardenBox.width-4,gardenBox.y+gardenBox.height+76,{steps:8});await page.mouse.up();
 const resizedGarden=await outdoor.evaluate(el=>el.getBoundingClientRect().height);assert.ok(resizedGarden>gardenBox.height+40);
 await page.locator('#sort').selectOption('price_asc');
 assert.equal(await page.getByLabel('garden_description Alpha Road',{exact:true}).evaluate(el=>el.getBoundingClientRect().height),resizedGarden);
 await page.locator('#sort').selectOption('manual');
 console.log('GARDEN_RESIZE_UI_PASS manual height persists through catalogue redraw');
 await page.evaluate(()=>window.__delayStationSave=450);
 const draft=page.getByLabel('garden_description Alpha Road',{exact:true});
 await draft.fill(outdoorNote+'\nOwner garden draft');
 await page.locator('#refresh').click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').garden_description.endsWith('Owner garden draft'));
 assert.match(await page.getByLabel('garden_description Alpha Road',{exact:true}).inputValue(),/Owner garden draft/);
 await page.evaluate(()=>window.__delayStationSave=0);
 console.log('MEASUREMENT_DRAFT_UI_PASS refresh retains and saves an in-progress garden edit');
 console.log('OUTDOOR_NOTES_UI_PASS complete multiline garden/parking text is visible in its existing garden block');
 // Contrasting walking times and distances exercise the combined station filter and sorting.
 await page.evaluate(()=>{window.__originalWalking=window.__fixtureRows.map(p=>structuredClone(p.station_commutes));for(const [i,p] of window.__fixtureRows.entries()){const minutes=[[8,2,25],[5,20,25],[9,3,25],[60,60,60],[61,61,61],[62,62,62]][i];p.station_commutes.google_routes.results.forEach((x,j)=>x.walking_minutes=minutes[j])}});
 await page.locator('#refresh').click();
 const selectStations=async names=>{await page.getByTitle('Filter houses by station').click();const menu=page.locator('.hh-status-filter-menu:visible');await menu.getByRole('button',{name:'Clear all',exact:true}).click();for(const name of names)await menu.locator('label').filter({hasText:name}).locator('input').check();await menu.getByRole('button',{name:'Apply',exact:true}).click()};
 await selectStations(['Alpha Station','Beta Station']);await page.locator('#sort').selectOption('station_asc');
 assert.deepEqual(await addresses(),['Alpha Road','Gamma Road','Beta Road','Legacy Road']);
 await selectStations(['Alpha Station']);assert.deepEqual(await addresses(),['Beta Road','Alpha Road','Gamma Road','Legacy Road']);
 await page.locator('#search').fill('Alpha');assert.deepEqual(await addresses(),['Alpha Road']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 assert.equal(await page.locator('#search').inputValue(),'');assert.equal(await page.locator('#sort').inputValue(),'station_asc');assert.equal((await addresses()).length,4);
 await page.locator('#search').fill('Beta');assert.equal(await page.getByRole('button',{name:'Clear filters',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await page.locator('#search').inputValue(),'');
 await page.evaluate(()=>window.__fixtureRows.forEach((p,i)=>p.station_commutes=window.__originalWalking[i]));await page.locator('#refresh').click();await page.locator('#sort').selectOption('manual');
 console.log('FILTER_WALK_MINUTES_UI_PASS combined station filter, minutes ordering, search reset and retained sort');
 // Reproduce 13 vs 10 minute case with prices after filtering and sorting.
 await page.evaluate(()=>{window.__stationScenario=window.__fixtureRows.map(p=>({name:p.station_name,commutes:structuredClone(p.station_commutes),journeys:structuredClone(p.journey_estimates)}));for(const [i,name,minutes] of [[0,'Hounslow',13],[1,'Norbury',10]]){const p=window.__fixtureRows[i];p.station_name=name;p.station_commutes.google_routes.stations[0]=name;p.station_commutes.google_routes.results[0].walking_minutes=minutes;p.journey_estimates={dancelab:{minutes:i===0?40:55},waterloo:{minutes:i===0?50:35},dilly:{minutes:60}}}});
 await page.locator('#refresh').click();await selectStations(['Hounslow','Norbury']);await page.locator('#sort').selectOption('station_asc');
 assert.deepEqual(await addresses(),['Beta Road','Alpha Road'],'10 walking minutes precedes 13');
 const visiblePrices=page.locator('.hh-table tbody tr .hh-house-price');assert.equal(await visiblePrices.count(),2);assert.deepEqual(await visiblePrices.allTextContents(),['£500,000','£500,000']);
 assert.equal(await page.locator('.hh-table .hh-sort-station').count(),0,'Station sorting must not add a visible row');
 await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollLeft=1200);assert.equal(await visiblePrices.first().isVisible(),true);await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollLeft=0);
 const journeyMenu=async()=>{await page.getByTitle('Filter journey times').click();return page.locator('.hh-journey-filter:visible')};
 let jm=await journeyMenu();await jm.getByLabel('Dance Lab (minutes)').fill('45');await jm.getByRole('button',{name:'Apply',exact:true}).click();assert.deepEqual(await addresses(),['Alpha Road']);assert.equal(await page.locator('.hh-table tbody tr .hh-house-price').innerText(),'£500,000');
 jm=await journeyMenu();await jm.getByLabel('Dance Lab (minutes)').fill('60');await jm.getByLabel('Waterloo (minutes)').fill('40');await jm.getByRole('button',{name:'Apply',exact:true}).click();assert.deepEqual(await addresses(),['Beta Road']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal((await addresses()).length,4);
 await page.evaluate(()=>window.__fixtureRows.forEach((p,i)=>{p.station_name=window.__stationScenario[i].name;p.station_commutes=window.__stationScenario[i].commutes;p.journey_estimates=window.__stationScenario[i].journeys}));await page.locator('#refresh').click();await page.locator('#sort').selectOption('manual');
 console.log('FILTER_SORT_PRICE_JOURNEY_PASS 10 before 13, selected station label, visible price and combined journey filters');

 // Area bounds use the displayed first figure, even when the plan has a different total.
 await page.evaluate(()=>{window.__areaOriginal=window.__fixtureRows.map(p=>({area:p.floor_area_sqm,diagnostics:structuredClone(p.import_diagnostics)}));window.__fixtureRows.forEach((p,i)=>p.floor_area_sqm=[80,85,100,null,75,90][i]);const p=window.__fixtureRows[0];p.import_diagnostics.source_values={floor_area_sqm:80};p.import_diagnostics.floorplan_measurements={labelled_values:{floor_area_sqm:120}}});
 await page.locator('#refresh').click();
 const areaMenu=async()=>{await page.getByTitle('Filter by floor area in square metres').click();return page.locator('.hh-area-filter:visible')};
 let am=await areaMenu();await am.getByLabel('Minimum (m²)').fill('85');await am.getByLabel('Maximum (m²)').fill('100');await am.getByRole('button',{name:'Apply',exact:true}).click();
 assert.deepEqual(await addresses(),['Beta Road','Gamma Road']);
 am=await areaMenu();await am.getByLabel('Minimum (m²)').fill('80');await am.getByLabel('Maximum (m²)').fill('85');await am.getByRole('button',{name:'Apply',exact:true}).click();
 assert.deepEqual(await addresses(),['Alpha Road','Beta Road'],'The 120 m² plan must not replace the first value of 80 m²');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal((await addresses()).length,4);
 await page.evaluate(()=>window.__fixtureRows.forEach((p,i)=>{p.floor_area_sqm=window.__areaOriginal[i].area;p.import_diagnostics=window.__areaOriginal[i].diagnostics}));await page.locator('#refresh').click();
 const fixedPrice=()=>page.locator('.hh-table tbody tr').filter({hasText:'Alpha Road'}).locator('.hh-house-price');assert.equal(await fixedPrice().innerText(),'£500,000');
 await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollLeft=1200);assert.equal(await fixedPrice().isVisible(),true);
 await page.evaluate(()=>document.querySelector('.hh-table-shell').scrollLeft=0);
 await page.getByLabel('price Alpha Road',{exact:true}).fill('499000');await page.getByLabel('price Alpha Road',{exact:true}).press('Tab');await page.waitForFunction(()=>document.querySelector('.hh-house-price')?.textContent==='£499,000');
 await page.getByLabel('price Alpha Road',{exact:true}).fill('500000');await page.getByLabel('price Alpha Road',{exact:true}).press('Tab');await page.waitForFunction(()=>document.querySelector('.hh-house-price')?.textContent==='£500,000');
 console.log('AREA_FILTER_PINNED_PRICE_PASS range, first value, reset, horizontal scroll, price edits');
 // Exercise both horizontal edges with an active filter; vertical behaviour stays unchanged.
 await page.locator('#search').fill('Alpha');
 const scrollGuard=await page.evaluate(()=>{const table=document.querySelector('.hh-table-shell');window.__scrollGuardDocument=document;return {tableX:getComputedStyle(table).overscrollBehaviorX,tableY:getComputedStyle(table).overscrollBehaviorY,rootX:getComputedStyle(document.documentElement).overscrollBehaviorX}});
 assert.deepEqual(scrollGuard,{tableX:'none',tableY:'auto',rootX:'none'});
 const scrollBox=page.locator('.hh-table-shell');await scrollBox.scrollIntoViewIfNeeded();const box=await scrollBox.boundingBox();await page.mouse.move(box.x+box.width/2,Math.min(box.y+100,900));
 await page.mouse.wheel(1100,0);await page.waitForFunction(()=>document.querySelector('.hh-table-shell').scrollLeft>0);
 await page.mouse.wheel(-2500,0);await page.waitForFunction(()=>document.querySelector('.hh-table-shell').scrollLeft===0);
 await page.mouse.wheel(-500,0);assert.equal(await page.evaluate(()=>window.__scrollGuardDocument===document),true);assert.equal(await page.locator('#search').inputValue(),'Alpha');assert.deepEqual(await addresses(),['Alpha Road']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 console.log('HORIZONTAL_OVERSCROLL_PASS horizontal movement, both boundaries, active filter, vertical behaviour');
 const savedDates=await page.evaluate(()=>Object.fromEntries(window.__fixtureRows.map(p=>[p.id,p.viewing_at])));
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
 // Simulate another tab changing a date after this table was loaded.
 await page.evaluate(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at='2026-11-16T17:45:00.000Z');
 await dateButton().click();
 assert.equal(await dateDialog.getByRole('button',{name:'16 November',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await dateDialog.getByLabel('Time',{exact:true}).inputValue(),'17:45');
 await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(value=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at=value,savedDates.alpha);
 await dateButton().click();await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await dateButton().innerText(),'15 Nov\n14:05');
 for(const button of await page.locator('.hh-table .hh-viewing-date').all()){
  await button.click();
  assert.equal(await dateDialog.locator('.hh-calendar-day[aria-pressed=true]').count(),1);
  assert.ok(await dateDialog.getByLabel('Time',{exact:true}).inputValue());
  assert.ok(!/\d/.test(await dateDialog.locator('.hh-calendar-head strong').innerText()),'The calendar does not require a year field');
  await dateDialog.getByRole('button',{name:'Next month',exact:true}).click();
  await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 await page.locator('#stageFilter').selectOption('archived');
 await page.getByRole('button',{name:'Viewing date Archive Road',exact:true}).click();
 assert.equal(await dateDialog.getByLabel('Time',{exact:true}).inputValue(),'17:15');
 await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('#stageFilter').selectOption('all');
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(window.__fixtureRows.map(p=>[p.id,p.viewing_at]))),savedDates);
 assert.equal(await page.evaluate(()=>window.__fixtureWrites.some(write=>Object.hasOwn(write.patch,'viewing_at'))),false,'Opening, navigating and cancelling every calendar must not write dates');
 const betaDetails=page.locator('.hh-table tbody tr').filter({hasText:'Beta Road'});
 await betaDetails.getByRole('button',{name:'Details',exact:true}).click();await page.locator('#editPrice').fill('501000');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='beta').price===501000);
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(window.__fixtureRows.map(p=>[p.id,p.viewing_at]))),savedDates);
 assert.equal(await page.evaluate(()=>window.__fixtureWrites.filter(write=>write.patch.price===501000).some(write=>Object.hasOwn(write.patch,'viewing_at'))),false,'Unrelated Details edits omit the viewing date from the update');
 assert.equal(await page.locator('input[type=datetime-local],input[type=date],input[type=time]').count(),0);
 console.log('VIEWING_DATE_PRESERVATION_PASS six exact timestamps retained through load, every calendar open/cancel, month navigation, archive and unrelated Details save');
 await dateButton().click();
 assert.equal(await dateDialog.getByRole('button',{name:'15 November',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await dateDialog.getByLabel('Time',{exact:true}).inputValue(),'14:05');
 await enterViewing(dateDialog,{day:12,month:12,time:'12:11'});await snapshot('viewing-calendar-december');
 await dateDialog.getByLabel('Time',{exact:true}).press('Enter');
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at==='2026-12-12T12:11:00.000Z');
 await page.locator('#refresh').click();assert.equal(await dateButton().innerText(),'12 Dec\n12:11');
 await dateButton().click();const clock=dateDialog.getByLabel('Time',{exact:true});await clock.focus();await clock.pressSequentially('12:00');
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at==='2026-12-12T12:00:00.000Z');
 await views.getByRole('button',{name:'Undo',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at==='2026-12-12T12:11:00.000Z');
 await dateButton().click();await dateDialog.getByLabel('Time',{exact:true}).pressSequentially('12:00');await dateDialog.getByLabel('Time',{exact:true}).press('Enter');
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at==='2026-12-12T12:00:00.000Z');
 await page.reload();await page.locator('.hh-table tbody tr').first().waitFor();assert.equal(await dateButton().innerText(),'12 Dec\n12:00');
 await dateButton().click();assert.equal(await dateDialog.getByRole('button',{name:'12 December',exact:true}).getAttribute('aria-pressed'),'true');
 await dateDialog.getByLabel('Time',{exact:true}).fill('');await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 assert.match(await dateDialog.locator('.hh-date-error').innerText(),/HH:MM/);
 assert.equal(await page.evaluate(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at),'2026-12-12T12:00:00.000Z','Blank time cannot erase a saved date');
 await dateDialog.getByLabel('Time',{exact:true}).fill('25:00');await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 assert.match(await dateDialog.locator('.hh-date-error').innerText(),/Hours must/);
 await dateDialog.getByRole('button',{name:'Cancel',exact:true}).click();
 await dateButton().click();await dateDialog.getByRole('button',{name:'Clear date',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at===null);
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(window.__fixtureRows.filter(p=>p.id!=='alpha').map(p=>[p.id,p.viewing_at]))),Object.fromEntries(Object.entries(savedDates).filter(([id])=>id!=='alpha')),'Clear date affects only its own house');
 await dateButton().click();await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();assert.match(await dateDialog.locator('.hh-date-error').innerText(),/Choose a date/);
 await enterViewing(dateDialog,{day:12,month:12,time:'12:00'});await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='alpha').viewing_at==='2026-12-12T12:00:00.000Z');
 // A background refresh redraws the table while the date save is in flight.
 await page.evaluate(()=>window.__delayStationSave=450);
 await dateButton().click();await enterViewing(dateDialog,{day:13,month:12,time:'17:45'});
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 await page.evaluate(()=>document.querySelector('#refresh').click());
 await dateDialog.waitFor({state:'hidden'});
 assert.equal(await dateButton().innerText(),'13 Dec\n17:45','The visible row updates even if it was redrawn during save');
 await page.evaluate(()=>window.__delayStationSave=0);
 await dateButton().click();assert.equal(await dateDialog.getByRole('button',{name:'13 December',exact:true}).getAttribute('aria-pressed'),'true');
 await enterViewing(dateDialog,{day:12,month:12,time:'12:00'});await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();
 await dateDialog.waitFor({state:'hidden'});assert.equal(await dateButton().innerText(),'12 Dec\n12:00','The date can be changed again without reloading');
 await page.getByRole('button',{name:'Viewing date Beta Road',exact:true}).click();
 await dateDialog.getByRole('button',{name:'Next month',exact:true}).click();
 assert.equal(await dateDialog.locator('.hh-calendar-head strong').innerText(),'January');
 await dateDialog.getByRole('button',{name:'12 January',exact:true}).click();await dateDialog.getByLabel('Time',{exact:true}).pressSequentially('12:00');
 await dateDialog.getByRole('button',{name:'Save date',exact:true}).click();await page.waitForFunction(()=>window.__fixtureRows.find(p=>p.id==='beta').viewing_at==='2027-01-12T12:00:00.000Z');
 console.log('VIEWING_DATE_UI_PASS clickable calendar, one-field keyboard 12:11/12:00, Enter/save, Refresh/reload/reopen, Undo, explicit-only clearing, blank/invalid time preservation, next-year navigation without year/seconds inputs');
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
 assert.equal((await addresses()).length,4);
 assert.equal(await page.getByLabel('comment_david Alpha Road',{exact:true}).inputValue(),'Keep decision alpha');
 await page.locator('#sort').selectOption('agency_asc');
 assert.deepEqual(await addresses(),['Beta Road','Gamma Road','Alpha Road','Legacy Road']);
 await page.locator('#sort').selectOption('agency_desc');
 assert.deepEqual(await addresses(),['Alpha Road','Beta Road','Gamma Road','Legacy Road']);

 await page.locator('th').filter({hasText:'Viewing status'}).getByRole('button',{name:'Filter'}).click();
 const menu=page.locator('.hh-status-filter-menu:visible');
 const choices=await menu.locator('input[type=checkbox]').evaluateAll(inputs=>inputs.map(input=>input.value));
 assert.ok(choices.includes('enquire_viewing'));assert.ok(choices.includes('requested_viewing'));assert.ok(choices.includes('under_offer'));
 assert.equal(await menu.locator('input[value=under_offer]').isChecked(),false);assert.equal(await menu.locator('input[value=only_wo]').isChecked(),false);
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
 await page.locator('#stageFilter').selectOption('all');assert.equal((await addresses()).length,5);

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
 const beforeOutdoor=await page.evaluate(()=>window.__fixtureRows.map(({garden_area_sqm,garden_description,import_diagnostics,...p})=>p));
 await page.evaluate(()=>window.__outdoorFixture=true);
 await appMenu.locator('summary').click();await page.locator('#refreshOutdoors').click();
 await page.waitForFunction(()=>window.__fixtureRows.every(p=>p.import_diagnostics?.outdoor_details?.version==='measurements-v4'));
 for(const p of await page.evaluate(()=>window.__fixtureRows)){assert.equal(p.garden_area_sqm,60);assert.match(p.garden_description,/Off-street parking for two cars/)}
 assert.deepEqual(await page.evaluate(()=>window.__fixtureRows.map(({garden_area_sqm,garden_description,import_diagnostics,...p})=>p)),beforeOutdoor);
 console.log('OUTDOOR_REFRESH_UI_PASS Menu reprocesses existing cards, displays sizes and parking, preserves exact dates, comments, routes and station choices');
 // Keep an already loaded image element when sorting or filtering rebuilds rows.
 await page.evaluate(()=>{const p=window.__fixtureRows.find(x=>x.id==='alpha');p.images=[{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/IioAAAAASUVORK5CYII=',sha256:'a'.repeat(64)}]});
 await page.locator('#refresh').click();await page.waitForFunction(()=>{const img=document.querySelector('img[aria-label="Enlarge photograph 1 of Alpha Road"]');return img?.src&&img.complete});
 await page.evaluate(()=>window.__retainedImage=document.querySelector('img[aria-label="Enlarge photograph 1 of Alpha Road"]'));
 await page.locator('#sort').selectOption('price_asc');await page.locator('#search').fill('Alpha');
 assert.equal(await page.evaluate(()=>document.querySelector('.hh-table tbody tr .hh-photo-grid img')===window.__retainedImage),true,'Loaded photo survives filter and sort');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.hh-table tbody tr .hh-photo-grid img')].includes(window.__retainedImage)),true,'Restoring the rows retains the loaded photo');
 await page.evaluate(()=>{const p=window.__fixtureRows.find(x=>x.id==='alpha');p.images=[{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/IioAAAAASUVORK5CYII=#replacement',sha256:'b'.repeat(64)}]});
 await page.locator('#refresh').click();await page.waitForFunction(()=>![...document.querySelectorAll('.hh-table tbody tr .hh-photo-grid img')].includes(window.__retainedImage));
 console.log('PHOTO_REUSE_UI_PASS loaded image retained on filtering and sorting, invalidated when photos change');
 await page.evaluate(()=>window.__holdImport=true);
 await page.locator('#urlInput').fill('https://www.zoopla.co.uk/for-sale/details/888001');await page.locator('#importButton').click();
 await page.waitForFunction(()=>document.querySelector('#importQueue')?.innerText.includes('Saving'));
 await page.locator('#urlInput').fill('https://www.rightmove.co.uk/properties/888002');await page.locator('#importButton').click();
 await page.waitForFunction(()=>document.querySelectorAll('.hh-import-item').length===2);
 assert.match(await page.locator('#importQueue').innerText(),/Saving.*888001/s);
 assert.match(await page.locator('#importQueue').innerText(),/Queued.*888002/s);
 assert.equal(await page.locator('#importButton').isEnabled(),true);
 console.log('IMPORT_QUEUE_UI_PASS second link accepted while first listing is being read');
 if(process.env.HH_UI_SCREENSHOT)await page.screenshot({path:process.env.HH_UI_SCREENSHOT,fullPage:false});
 console.log('CATALOGUE_UI_PASS agency sorting, workflow filters, independent enquiry/request, current decision, legacy preservation, archive restore');
 console.log('MANUAL_STATION_UI_PASS inline rename, detail rename, automatic walking/PT, Refresh retry, reopen resumes only missing component');
 // Synthetic browser-only benchmark: no network images, isolated fixture data.
 const results=[];
 for(const count of [80,160,320]){
  const benchmarkStart=Date.now();await page.evaluate(count=>{const base=structuredClone(window.__fixtureRows[0]);window.__fixtureRows.splice(0);for(let i=0;i<count;i++)window.__fixtureRows.push({...structuredClone(base),id:'benchmark-'+i,address:'Benchmark Road '+i,status:'interested',images:[],sort_order:i})},count);
  await page.locator('#refresh').click();await page.waitForFunction(count=>document.querySelectorAll('.hh-table tbody tr').length===count,count,{timeout:60000});
  const loadMs=Date.now()-benchmarkStart;
  const sortStart=Date.now();await page.locator('#sort').selectOption('station_asc');const sortMs=Date.now()-sortStart;
  results.push({homes:count,load_ms:Math.round(loadMs),sort_ms:Math.round(sortMs)});
 }
 console.log('CATALOGUE_SYNTHETIC_BENCH '+JSON.stringify(results));

}finally{await browser.close();await new Promise(done=>server.close(done))}
