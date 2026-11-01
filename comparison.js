import {setupStationAccess} from './station-commutes.js?v=18';
export function setupComparison({sb,history,photo,uniquePhotos,openHouse,openPhotoBrowser,onReorder,canReorder,onStatusChange,shouldAutoCalculate,onRestore,getStatusSelection,onStatusFilterChange}){
const stationAccess=setupStationAccess({sb,history,shouldAutoCalculate});
const $=id=>document.getElementById(id),node=(tag,cls='',content)=>{const x=document.createElement(tag);x.className=cls;if(content!==undefined)x.textContent=content;return x};
const statuses={'':'—',interested:'Interested',viewing_booked:'Viewing booked',viewed:'Viewed',shortlisted:'Shortlisted',rejected:'Rejected',under_offer_sold:'Under offer / Sold',archived:'Archive (hide)',deleted:'Delete (move to trash)'};
const labels=['House','Price','Bedrooms','Bathrooms / WC','Floors','Total floor area','Garden','Nearest station','Journey times','Sabina comments','David comments','Viewing status','Viewing date'];
const extras=[['title','Listing title','text'],['url','Original listing URL','text'],['property_type','Property type','text'],['tenure','Tenure','text'],['latitude','Latitude','number'],['longitude','Longitude','number'],['wc_count','Separate WC','number'],['floors','Floors','number'],['floor_area_sqm','Floor area (m²)','number'],['garden_area_sqm','Garden area (m²)','number'],['garden_description','Garden description','textarea'],['station_name','Nearest station 1','text'],['station_distance_miles','Walking distance 1 (miles)','number'],['station_2_name','Nearest station 2','text'],['station_2_distance_miles','Walking distance 2 (miles)','number'],['station_3_name','Nearest station 3','text'],['station_3_distance_miles','Walking distance 3 (miles)','number'],['comment_sabina','Sabina comments','textarea'],['comment_david','David comments','textarea']];
const nums=new Set(['latitude','longitude','bedrooms','bathrooms','wc_count','floors','floor_area_sqm','garden_area_sqm','station_distance_miles','station_2_distance_miles','station_3_distance_miles']);
const money=p=>p==null?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(p);
const clean=x=>String(x||'House').replace(/^\s*\d+\s*bed(?:room)?s?\s+.*?\s+(?:for sale|to rent)\s*/i,'').replace(/^\s*property\s+for\s+sale\s*/i,'').replace(/\s*[-|]\s*zoopla.*$/i,'').replace(/\s*[-|]\s*rightmove.*$/i,'').replace(/,\s*(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]{1,2}\d[A-Z\d]?)$/i,'').replace(/\s+(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|[A-Z]{1,2}\d[A-Z\d]?)$/i,'').trim();
const bar=node('div','hh-views'),tableBtn=node('button','active','Table'),mapBtn=node('button','','Map'),cardsBtn=node('button','','Cards'),undoBtn=node('button','hh-undo','Undo last edit'),notice=node('span','hh-notice','Changes save automatically.');
bar.append(tableBtn,mapBtn,cardsBtn,undoBtn,notice);
const wrap=node('section','hh-table-shell'),table=node('table','hh-table'),mapPanel=node('section'),mapMsg=node('p','hh-mapmsg','Map shows approximate positions when coordinates are available.'),mapDiv=node('div','hh-map'),missingDiv=node('div','hh-maplist');
wrap.append(table);mapPanel.append(mapMsg,mapDiv,missingDiv);mapPanel.hidden=true;$('cards').before(bar,wrap,mapPanel);
let rows=[],mode='table',L=null,map=null,markers=null,mapFramed=false,lastMapSig='';
 history.subscribe(n=>{undoBtn.disabled=n===0;undoBtn.title=n?n+' manual changes can be undone':'No manual changes to undo'});
 undoBtn.onclick=async()=>{undoBtn.disabled=true;const r=await history.undo();if(r.error)flash(r.error.message,true);else flash('Last change undone');undoBtn.disabled=!history.canUndo()};
function flash(msg,fail=false){notice.textContent=msg;notice.style.color=fail?'#af4b45':'#315e50';setTimeout(()=>{notice.textContent='Changes save for both of you.';notice.style.color=''},3000)}
function selectMode(which){mode=which;tableBtn.classList.toggle('active',which==='table');mapBtn.classList.toggle('active',which==='map');cardsBtn.classList.toggle('active',which==='cards');wrap.hidden=which!=='table';mapPanel.hidden=which!=='map';$('cards').style.display=which==='cards'?'':'none';$('empty').hidden=which!=='cards'||!!rows.length;if(which==='map')showMap().catch(e=>{console.error('Property map',e);mapMsg.textContent='Map could not be loaded: '+e.message+' Select Table and then Map to retry.'})}
tableBtn.onclick=()=>selectMode('table');mapBtn.onclick=()=>selectMode('map');cardsBtn.onclick=()=>selectMode('cards');selectMode('table');
function cast(k,v){return nums.has(k)?(v===''?null:Number(v)):v}
async function save(p,key,value,input){
 const val=cast(key,value);
 if(key==='status'&&val==='deleted'&&!window.confirm('Move '+p.address+' to Deleted? It can be restored.')){if(input)input.value=p.status||'';return}
 if(nums.has(key)&&val!==null&&!Number.isFinite(val)){flash('Invalid number',true);return}
 if(String(p[key]??'')===String(val??''))return;
 const overrides={...(p.manual_overrides||{}),[key]:true};
 const r=await history.save(p,{[key]:val,manual_overrides:overrides});
 if(r.error){flash(r.error.message,true);input?.classList.add('hh-savefail');return}
 input?.classList.remove('hh-savefail');flash('Saved');if(key==='status')await onStatusChange?.(p,val);
}
function editor(p,key,type='text'){let x=node(type==='textarea'?'textarea':type==='select'?'select':'input');if(type==='select'){for(const [v,label] of Object.entries(statuses)){const opt=node('option','',label);opt.value=v;x.append(opt)}x.value=p[key]||''}else{if(type==='number'){x.type='number';x.step='any';x.min='0'}if(type==='textarea')x.rows=6;x.value=p[key]??''}x.setAttribute('aria-label',key+' '+p.address);let tid;if(type==='textarea'){const minimum=(key==='comment_sabina'||key==='comment_david')?230:86;const resize=()=>{x.style.height='auto';x.style.height=Math.max(minimum,x.scrollHeight+8)+'px'};x.style.resize='none';x.style.overflowY='hidden';resize();x.addEventListener('input',()=>{resize();clearTimeout(tid);tid=setTimeout(()=>save(p,key,x.value,x),800)});x.addEventListener('blur',()=>{clearTimeout(tid);save(p,key,x.value,x)})}else x.addEventListener('change',()=>save(p,key,x.value,x));return x}
const cell=value=>{const t=node('td');if(value instanceof Node)t.append(value);else t.textContent=value;return t};
const val=v=>v==null||v===''?'—':String(v);

async function distinctPhotos(p,container){
  const photos=await uniquePhotos(p,4);
  if(!photos.length){container.append(node('div','hh-photo-unavailable','No photos'));return}
  for(let i=0;i<photos.length;i++){
    const img=node('img','hh-photo'+(i===0?' hh-photo-main':''));
    img.alt='Property photograph '+(i+1);
    img.loading='lazy';
    img.onclick=()=>openPhotoBrowser(p,i);
    img.style.cursor='zoom-in';
    img.tabIndex=0;
    img.setAttribute('role','button');
    img.setAttribute('aria-label','Enlarge photograph '+(i+1)+' of '+p.address);
    img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhotoBrowser(p,i)}};
    container.append(img);
    try{const url=await photo(photos[i]);if(url)img.src=url;else img.classList.add('hh-photo-missing')}
    catch(e){img.classList.add('hh-photo-missing')}
  }
}
function labelledEditor(p,label,key,type='text'){
 const box=node('label','hh-field');
 box.append(node('span','hh-mini',label),editor(p,key,type));
 return box;
}


/* Shared TfL arrival-time estimates. No guessed durations are displayed. */
const travelDestinations=[
 {id:'dancelab',title:'Dance Lab',arrival:'19:50'},
 {id:'dilly',title:'The Dilly',arrival:'18:40'},
 {id:'waterloo',title:'Waterloo',arrival:'07:40'}
];
const journeyQueue=[],queuedJourneys=new Set(),journeyViews=new Map(),journeyRetryAfter=new Map();
let travelProcessing=false,travelFailures=0,journeyPauseUntil=0;
const journeyFresh=p=>travelDestinations.every(d=>{
 const v=p.journey_estimates?.[d.id];
 return v&&Number.isFinite(Number(v.minutes))&&v.origin===p.latitude+','+p.longitude&&(v.manual_override===true||v.audit_version==='arrival-closest-20261030'||v.calculation_version==='arrival-closest-v2'||Date.now()-Date.parse(v.calculated_at)<7*86400000)
});
function journeySummary(p,d){
 const v=p.journey_estimates?.[d.id];
 if(v&&Number.isFinite(Number(v.minutes))&&v.minutes>0){
   const verified=v.audit_version==='google-address-validated-v1'&&v.address===p.address;
   const label=v.manual_override===true?'manual':verified?'Google':'';
   return Math.round(v.minutes)+' min'+(label?' · '+label:'');
 }
 return '—';
}
async function drainJourneyQueue(){
 if(travelProcessing)return;travelProcessing=true;
 while(journeyQueue.length){
  const p=journeyQueue.shift();
  if(journeyPauseUntil>Date.now())await new Promise(resolve=>setTimeout(resolve,journeyPauseUntil-Date.now()));
  try{
   const r=await sb.functions.invoke('house-hunt-journeys',{body:{id:p.id}});
   if(r.error)throw r.error;
   if(r.data?.journeys&&Object.values(r.data.journeys).some(x=>Number(x?.minutes)>0)){
    p.journey_estimates=r.data.journeys;
    const view=journeyViews.get(p.id);
    if(view)for(const d of travelDestinations){const span=view[d.id];if(span)span.textContent=journeySummary(p,d)}
    travelFailures=0;
   }else throw Error(r.data?.error||'No estimates returned');
  }catch(e){travelFailures++;journeyRetryAfter.set(p.id,Date.now()+180000);if(travelFailures>=3){journeyPauseUntil=Date.now()+90000;travelFailures=0;}console.warn('Journey estimate:',e);
   const view=journeyViews.get(p.id);if(view)for(const d of travelDestinations){if(view[d.id])view[d.id].textContent='Unavailable'}
  }
  queuedJourneys.delete(p.id);
  await new Promise(resolve=>setTimeout(resolve,5200));
 }
 travelProcessing=false;
}
function travelCell(p){
 const wrapper=node('div','hh-travel'),view={};
 for(const d of travelDestinations){
  const line=node('div','hh-trip'),title=node('span','hh-trip-title',d.title+' · '+d.arrival),minutes=node('strong','hh-trip-minutes',journeySummary(p,d));
  line.append(title,minutes);
   minutes.title='Click to edit this journey time';minutes.style.cursor='text';
   minutes.onclick=()=>{
    if(line.querySelector('input'))return;
    const input=node('input','hh-journey-inline');input.type='number';input.min='0';input.step='1';input.value=p.journey_estimates?.[d.id]?.minutes??'';
    line.replaceChildren(title,input);input.focus();input.select();
    let busy=false;
    const commit=async()=>{if(busy)return;busy=true;
     const n=Number(input.value);
     if(input.value.trim()===''||!Number.isFinite(n)||n<0){flash('Invalid journey minutes',true);line.replaceChildren(title,minutes);return}
     const data={...(p.journey_estimates||{}),[d.id]:{...(p.journey_estimates?.[d.id]||{}),minutes:n,origin:p.latitude+','+p.longitude,calculated_at:new Date().toISOString(),manual_override:true}};
     const r=await history.save(p,{journey_estimates:data});
     if(r.error)flash(r.error.message,true);else{minutes.textContent=Math.round(n)+' min';flash('Saved')}
     line.replaceChildren(title,minutes);
    };
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void commit()}if(e.key==='Escape'){busy=true;line.replaceChildren(title,minutes)}};
    input.onblur=()=>void commit();
   };
   wrapper.append(line);view[d.id]=minutes;
 }
 wrapper.append(node('small','hh-trip-help','Arrival time · typical Tuesday · public transport'));
 journeyViews.set(p.id,view);
 if(shouldAutoCalculate?.(p)&&p.latitude!=null&&p.longitude!=null&&!journeyFresh(p)&&!travelDestinations.some(d=>p.journey_estimates?.[d.id]?.manual_override===true)&&!queuedJourneys.has(p.id)&&Date.now()>(journeyRetryAfter.get(p.id)||0)){
   queuedJourneys.add(p.id);journeyQueue.push(p);void drainJourneyQueue();
 }
 if(p.latitude==null||p.longitude==null)for(const d of travelDestinations)view[d.id].textContent='Map point needed';
 return wrapper;
}

function render(list){
 rows=list;
 const head=node('thead'),hr=node('tr');
 for(const title of labels){
  const th=node('th','',title);
  if(title==='Viewing status'){
   th.classList.add('hh-status-filter-heading');
   const trigger=node('button','hh-status-filter-button','▾ Filter');
   trigger.type='button';trigger.title='Filter the table by viewing status';
   const menu=node('div','hh-status-filter-menu');menu.hidden=true;
   const heading=node('strong','','Viewing status');
   const options=node('div','hh-status-filter-options');
   const checks=new Map();
   const selectedNow=new Set(getStatusSelection?.()||Object.keys(statuses).filter(s=>s!=='archived'&&s!=='deleted'));
   const selectedLabels=[...selectedNow];
   const normal=Object.keys(statuses).filter(s=>s!=='archived'&&s!=='deleted');
   if(!(selectedLabels.length===normal.length&&normal.every(x=>selectedNow.has(x)))){
    trigger.textContent=selectedLabels.length===1?'▾ '+(selectedLabels[0]===''?'No status':(statuses[selectedLabels[0]]||selectedLabels[0]).replace(/ \(.*\)$/,'')):'▾ '+selectedLabels.length+' selected';
    trigger.classList.add('hh-status-filter-applied');
   }
   for(const [status,label] of Object.entries(statuses)){
    const option=node('label','hh-status-filter-option');
    const input=node('input');input.type='checkbox';input.value=status;input.checked=selectedNow.has(status);
    option.append(input,node('span','',status===''?'No status':label.replace(' (hide)','').replace(' (move to trash)','')));
    options.append(option);checks.set(status,input);
   }
   const quick=node('div','hh-status-filter-quick');
   const active=node('button','','All active'),all=node('button','','All statuses');
   active.type=all.type='button';
   active.onclick=()=>{for(const [key,input] of checks)input.checked=key!=='archived'&&key!=='deleted'};
   all.onclick=()=>{for(const input of checks.values())input.checked=true};
   quick.append(active,all);
   const actions=node('div','hh-status-filter-actions');
   const cancel=node('button','','Cancel'),apply=node('button','','Apply');
   cancel.type=apply.type='button';
   cancel.onclick=()=>{menu.hidden=true};
   apply.onclick=()=>{
    const chosen=[...checks].filter(([,input])=>input.checked).map(([key])=>key);
    if(!chosen.length){alert('Select at least one viewing status.');return}
    menu.hidden=true;onStatusFilterChange?.(chosen);
   };
   actions.append(cancel,apply);
   menu.append(heading,quick,options,actions);
   menu.addEventListener('click',e=>e.stopPropagation());
   trigger.onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden};
   th.append(trigger,menu);
  }
  hr.append(th);
 }
 head.append(hr);
 const body=node('tbody');
 table.replaceChildren(head,body);
 let dragId=null,scrollTimer=null,scrollVelocity=0;
 const stopDragScroll=()=>{if(scrollTimer!==null){clearInterval(scrollTimer);scrollTimer=null}scrollVelocity=0};
 const autoScroll=e=>{
  if(!dragId||!e.clientY)return;
  const r=wrap.getBoundingClientRect(),edge=78;
  const next=e.clientY<r.top+edge?-22:e.clientY>r.bottom-edge?22:0;
  if(next===scrollVelocity)return;
  stopDragScroll();scrollVelocity=next;
  if(next)scrollTimer=setInterval(()=>{wrap.scrollTop+=next},28);
 };
 wrap.ondragover=e=>{if(dragId){e.preventDefault();autoScroll(e)}};
 wrap.ondragleave=e=>{if(!wrap.contains(e.relatedTarget))stopDragScroll()};
 for(const [rowIndex,p] of list.entries()){
  try {
  const tr=node('tr');
  const house=node('div','hh-house'),photos=node('div','hh-photo-grid');
  distinctPhotos(p,photos).catch(e=>console.warn('Photo gallery',e));
  const address=node('div','hh-address',clean(p.address||p.title));
  address.contentEditable='true';address.setAttribute('role','textbox');address.setAttribute('aria-label','Property address, editable');
  address.spellcheck=false;address.title='Edit property address';
  address.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();address.blur()}});
  address.addEventListener('blur',()=>save(p,'address',address.textContent.trim(),address));
  const link=node('a','hh-original','Listing ↗');link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';
  const details=node('button','hh-house-details','Details');
  details.type='button';details.onclick=()=>openHouse(p);
  details.style.cssText='display:block;margin-top:6px;padding:5px 10px;font-size:12px;background:#fff;color:#315e50;border-color:#cbd7d1';
  const listingRow=node('div','hh-listing-row');listingRow.append(link);
  const positionLabel=node('span','hh-house-number','#'+(rowIndex+1));
  house.append(positionLabel,photos,address,listingRow);
  if(canReorder?.()){
    const tools=node('div','hh-move-controls'),grip=node('button','hh-drag-handle','↕ Drag');
    grip.type='button';grip.draggable=true;grip.title='Drag to place above another house';
    grip.ondragstart=e=>{dragId=p.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id);tr.classList.add('hh-dragging')};
    grip.ondrag=e=>{if(dragId===p.id)autoScroll(e)};
    grip.ondragend=()=>{stopDragScroll();dragId=null;tr.classList.remove('hh-dragging')};
    const up=node('button','hh-move-arrow','↑'),down=node('button','hh-move-arrow','↓');
    up.type='button';down.type='button';up.title='Move up one row';down.title='Move down one row';
    up.onclick=()=>void onReorder?.(p.id,p.id,-1);down.onclick=()=>void onReorder?.(p.id,p.id,1);
    const position=node('select','hh-position-select');
    position.setAttribute('aria-label','Move '+(p.address||'house')+' to position');
    position.title='Move directly to any position in the active list';
    const placeholder=node('option','','Move to…');placeholder.value='';position.append(placeholder);
    for(let i=1;i<=list.length;i++){const opt=node('option','',String(i));opt.value=String(i);position.append(opt)}
    position.value='';
    position.onchange=()=>{const newPosition=Number(position.value);if(Number.isInteger(newPosition)&&newPosition>=1&&newPosition<=list.length)void onReorder?.(p.id,p.id,0,newPosition);position.value=''};
    tools.append(grip,up,down,position);listingRow.append(tools);
    tr.ondragover=e=>{if(dragId&&dragId!==p.id){e.preventDefault();tr.classList.add('hh-drop-target')}};
    tr.ondragleave=()=>tr.classList.remove('hh-drop-target');
    tr.ondrop=e=>{e.preventDefault();stopDragScroll();tr.classList.remove('hh-drop-target');const source=dragId||e.dataTransfer.getData('text/plain');dragId=null;if(source&&source!==p.id)void onReorder?.(source,p.id)};
  }
  if(p.status==='archived'){
    const restore=node('button','hh-restore-house','Restore to active');
    restore.type='button';
    restore.onclick=async()=>{restore.disabled=true;try{await onRestore?.(p)}finally{restore.disabled=false}};
    listingRow.append(restore);
  }
  house.append(details);
  tr.append(cell(house));
  const price=labelledEditor(p,'£','price','number');price.classList.add('hh-price-editor');tr.append(cell(price));
  tr.append(cell(editor(p,'bedrooms','number')));
  const bath=node('div','hh-stack');
  bath.append(labelledEditor(p,'Bathrooms','bathrooms','number'),labelledEditor(p,'Separate WC','wc_count','number'));
  tr.append(cell(bath));
  tr.append(cell(editor(p,'floors','number')));
  const floorArea=node('div','hh-stack');floorArea.append(labelledEditor(p,'m²','floor_area_sqm','number'));
   const planUpload=node('button','hh-inline-plan-upload',(p.floorplans||[]).length?'Add / replace floor plan':'Upload floor plan');planUpload.type='button';planUpload.onclick=()=>window.hhOpenFloorplanUpload?.(p);floorArea.append(planUpload);
  if((p.floorplans||[]).length){
    const plan=node('a','hh-plan-link','Floor plan ↗');plan.href='#';plan.target='_blank';plan.rel='noopener noreferrer';plan.title='Open the original floor plan';
    photo(p.floorplans[0]).then(u=>{if(u)plan.href=u}).catch(()=>{});
    plan.addEventListener('click',e=>{if(plan.getAttribute('href')==='#'){e.preventDefault();openHouse(p)}});
    floorArea.append(plan);
  }
  tr.append(cell(floorArea));
  const garden=node('div','hh-stack');
  garden.append(labelledEditor(p,'Size (m²)','garden_area_sqm','number'),labelledEditor(p,'Description','garden_description','textarea'));
  tr.append(cell(garden));
  const station=node('div','hh-stack');
  for(let i=0;i<3;i++){
   if(i===2&&!p.station_3_name)continue;
   const name=i===0?p.station_name:i===1?p.station_2_name:p.station_3_name;
   const entry=node('div','hh-station-entry');
   const field=i===0?'station_name':i===1?'station_2_name':'station_3_name';
   const edit=editor(p,field);
   edit.classList.add('hh-station-name');
   edit.setAttribute('aria-label','Station '+(i+1));
   const service=p.station_commutes?.results?.[i]?.station_type||'';
   const isTube=service==='tube'||/underground|tube|ealing common/i.test(name||'');
   const isOverground=service==='overground'||/^(Wandsworth Road|Clapham High Street|Imperial Wharf|Gunnersbury|Richmond)$/i.test(name||'');
   const isTram=service==='tram'||/tram/i.test(name||'');
   if(isTube||isOverground||isTram){
    const symbol=node('span','hh-kind-inline '+(isTube?'hh-kind-tube':isOverground?'hh-kind-overground':'hh-kind-tram'),isTube?'Ⓜ':isOverground?'◎':'▱');
    symbol.title=isTube?'Underground':isOverground?'London Overground':'Tram';
    const nameRow=node('div','hh-station-name-row');nameRow.append(edit,symbol);entry.append(nameRow);
   }
   if(!entry.querySelector('.hh-station-name-row'))entry.append(edit);
   entry.append(stationAccess.attach(p,i));
   station.append(entry);
  }
  if(!p.station_3_name){
   const add=node('button','hh-add-station','+ 3rd station');add.type='button';
   add.onclick=()=>{const n=window.prompt('Third station name');if(n)void save(p,'station_3_name',n.trim(),null).then(()=>onStatusChange?.())};
   station.append(add);
  }
  tr.append(cell(station));
  tr.append(cell(travelCell(p)));
  tr.append(cell(editor(p,'comment_sabina','textarea')));
  tr.append(cell(editor(p,'comment_david','textarea')));
  tr.append(cell(editor(p,'status','select')));
  const view=node('input');view.type='datetime-local';view.value=p.viewing_at?p.viewing_at.slice(0,16):'';view.setAttribute('aria-label','Viewing date '+(p.address||p.title));view.onchange=async()=>{const v=view.value?new Date(view.value).toISOString():null;const r=await history.save(p,{viewing_at:v,manual_overrides:{...(p.manual_overrides||{}),viewing_at:true}});if(r.error)flash(r.error.message,true);else flash('Saved')};tr.append(cell(view));
  if(tr.cells.length!==labels.length)throw Error('Comparison column count mismatch');
  body.append(tr);
  }catch(e){
   console.error('House comparison row render failed',p.address||p.id,e);
   const fallback=node('tr','hh-render-fallback'),message=node('td');
   message.colSpan=labels.length;
   message.textContent=(p.address||p.title||'Property')+' · '+money(p.price)+' · Table row error: '+String(e?.message||e);
   fallback.append(message);body.append(fallback);
  }
 }
 $('empty').hidden=!!rows.length;
 if(mode==='map')redraw();
}
const detail=node('section','hh-aux'),detailGrid=node('div','hh-auxgrid'),controls={};
detail.append(node('h3','','Property details'),detailGrid);
for(const [key,label,type] of extras){const l=node('label',type==='textarea'?'wide':'');l.append(document.createTextNode(label));const x=node(type==='textarea'?'textarea':'input');if(type==='textarea')x.rows=2;else{x.type=type;if(type==='number')x.step='any'}l.append(x);controls[key]=x;detailGrid.append(l)}
$('dialog').querySelector('.actions').before(detail);
const floorPanel=node('section','hh-planbox'),floorContents=node('div');floorPanel.append(node('h3','','Floor plans'),floorContents);$('detailFacts').before(floorPanel);
async function open(p){for(const [key] of extras)controls[key].value=p[key]??'';floorContents.replaceChildren();if(!(p.floorplans||[]).length){floorPanel.hidden=true;return}floorPanel.hidden=false;
for(const f of p.floorplans){const u=await photo(f);if(!u)continue;if(/\.pdf(?:\?|$)/i.test(f.path||f.url||'')||/^https:\/\/www\.onthemarket\.com\/details\/\d+\/#\/floorplans\/\d+$/i.test(u)){const a=node('a','','Open floor plan ↗');a.href=u;a.target='_blank';a.rel='noopener noreferrer';floorContents.append(a)}else{const image=node('img');image.src=u;image.alt='Floor plan';floorContents.append(image)}}}
function edited(){const o={};for(const [key] of extras)o[key]=cast(key,controls[key].value);return o}
async function postcodeLocate(p){const a=p.address||p.title||'',full=a.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i),out=a.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b/i);if(!full&&!out)return false;const url=full?'https://api.postcodes.io/postcodes/'+encodeURIComponent(full[1].replace(/\s/g,'')):'https://api.postcodes.io/outcodes/'+encodeURIComponent(out[1]);const r=await fetch(url);if(!r.ok)return false;const j=await r.json(),v=j.result;if(!v||!Number.isFinite(v.latitude)||!Number.isFinite(v.longitude))return false;const saveResult=await sb.from('properties').update({latitude:v.latitude,longitude:v.longitude}).eq('id',p.id);if(saveResult.error)throw saveResult.error;p.latitude=v.latitude;p.longitude=v.longitude;return true}

const transitInfo=node('p','hh-transport-summary','🚆 Train · Ⓜ Underground · 🚋 Tram · 🚌 Bus (visible from zoom 14)');
const googleHelp=node('a','hh-google-link','Open Google Maps ↗');googleHelp.href='https://www.google.com/maps/@51.46,-0.31,12z';googleHelp.target='_blank';googleHelp.rel='noopener noreferrer';
const mapTools=node('div','hh-map-tools');mapTools.append(transitInfo,googleHelp);mapPanel.insertBefore(mapTools,mapDiv);
let transportLayer=null,transportTimeout=null,transitVersion=0,overpassCache=new Map();
const mapsFor=(p)=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(Number(p.latitude)+','+Number(p.longitude));
let leafletLoader=null;
async function ensureLeaflet(){
 if(window.L?.map)return window.L;
 if(leafletLoader)return leafletLoader;
 leafletLoader=(async()=>{
  const cdns=[
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
  ];
  for(const src of cdns){
   try{
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');
     const timer=setTimeout(()=>{script.remove();reject(Error('Leaflet script timed out'))},9000);
     script.src=src;script.async=true;
     script.onload=()=>{clearTimeout(timer);resolve()};
     script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Leaflet script failed'))};
     document.head.append(script);
    });
    if(window.L?.map)return window.L;
   }catch(e){console.warn('Map library CDN unavailable',src,e)}
  }
  throw Error('Could not load the map library. Check your connection and select Map again.');
 })().catch(e=>{leafletLoader=null;throw e});
 return leafletLoader;
}
async function showMap(){
 mapMsg.textContent='Loading property map…';
 L=await ensureLeaflet();
 if(!map){
  let saved=null;try{saved=JSON.parse(localStorage.getItem('hh-map-view')||'null')}catch{}
  const valid=saved&&Number.isFinite(saved.lat)&&Number.isFinite(saved.lon)&&Number.isFinite(saved.zoom)&&saved.zoom>=10&&saved.zoom<=19;
  map=L.map(mapDiv,{zoomControl:true,scrollWheelZoom:true,touchZoom:true,wheelPxPerZoomLevel:60,zoomSnap:0.5,preferCanvas:true}).setView(valid?[saved.lat,saved.lon]:[51.466,-.31],valid?saved.zoom:12);
  mapFramed=!!valid;
  const voyager=L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors © CARTO'});
  const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
  street.addTo(map);
  L.control.layers({'Street map':street,'Detailed map':voyager},null,{collapsed:true,position:'topright'}).addTo(map);
  transportLayer=L.layerGroup().addTo(map);
  markers=L.layerGroup().addTo(map);
  map.on('moveend zoomend',()=>{scheduleTransport();if(!map)return;const centre=map.getCenter();try{localStorage.setItem('hh-map-view',JSON.stringify({lat:centre.lat,lon:centre.lng,zoom:map.getZoom()}))}catch{}});
 }
 setTimeout(()=>{map.invalidateSize();scheduleTransport()},180);
 redraw();
}
function scheduleTransport(){
 if(!map||!transportLayer)return;
 if(transportTimeout)clearTimeout(transportTimeout);
 transportTimeout=setTimeout(()=>loadTransport().catch(e=>{transitInfo.textContent='Transport overlay unavailable. Google Maps links work for each house.';console.warn('Transport map',e)}),700);
}
async function loadTransport(){
 if(!map||!transportLayer)return;
 const zoom=map.getZoom(),bounds=map.getBounds();
 const sw=bounds.getSouthWest(),ne=bounds.getNorthEast();
 if(sw.lat<49||ne.lat>61||sw.lng< -9||ne.lng>3)return;
 const showBus=zoom>=14;
 const key=[showBus?'bus':'rail',...[sw.lat,sw.lng,ne.lat,ne.lng].map(n=>n.toFixed(2))].join(':');
 const current=++transitVersion;
 let features=overpassCache.get(key);
 if(!features){
  transitInfo.textContent=showBus?'Loading nearby stops from TfL…':'Loading stations from TfL…';
  const candidates=rows.filter(p=>p.latitude!=null&&p.longitude!=null&&bounds.contains([+p.latitude,+p.longitude]))
   .map(p=>({lat:+p.latitude,lon:+p.longitude})).sort((a,b)=>a.lat-b.lat||a.lon-b.lon);
  const centres=[];
  if(showBus){const mid=map.getCenter();centres.push({lat:mid.lat,lon:mid.lng})}
  else{
   // A small number of spaced-out points covers the separate neighbourhoods without hitting TfL rate limits.
   for(const p of candidates){
    const close=centres.some(x=>Math.abs(x.lat-p.lat)<0.018&&Math.abs(x.lon-p.lon)<0.028);
    if(!close)centres.push(p);
    if(centres.length>=9)break;
   }
   if(!centres.length){const mid=map.getCenter();centres.push({lat:mid.lat,lon:mid.lng})}
  }
  const radius=showBus?900:1800;
  const stopTypes=showBus?'NaptanRailStation,NaptanMetroStation,NaptanPublicBusCoachTram':'NaptanRailStation,NaptanMetroStation';
  const results=await Promise.allSettled(centres.map(async p=>{
    const url='https://api.tfl.gov.uk/StopPoint?'+new URLSearchParams({lat:String(p.lat),lon:String(p.lon),radius:String(radius),stopTypes});
    const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw Error('TfL '+res.status);
    const payload=await res.json();
    return Array.isArray(payload.stopPoints)?payload.stopPoints:[];
  }));
  const ok=results.filter(x=>x.status==='fulfilled');
  if(ok.length){
   features=[];
   for(const item of ok)for(const stop of item.value){
    const modes=Array.isArray(stop.modes)?stop.modes:[];
    const bus=stop.stopType==='NaptanPublicBusCoachTram'||modes.includes('bus');
    const tube=stop.stopType==='NaptanMetroStation'||modes.includes('tube');
    const tram=modes.includes('tram');
    if(bus&&!showBus)continue;
    const lat=Number(stop.lat),lon=Number(stop.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    features.push({lat,lon,tags:{
      name:String(stop.commonName||stop.fullName||''),
      highway:bus?'bus_stop':null,
      station:tube?'subway':null,
      railway:bus?null:tram?'tram_stop':'station',
      ref:(stop.lines||[]).slice(0,10).map(x=>x.name).filter(Boolean).join(', ')
    }});
   }
   overpassCache.set(key,features);
   if(overpassCache.size>14)overpassCache.delete(overpassCache.keys().next().value);
  }else{
   // Public Overpass is an optional fallback, not a required dependency.
   const coords=[sw.lat,sw.lng,ne.lat,ne.lng].map(n=>n.toFixed(5)).join(',');
   const query='[out:json][timeout:12];('+
     'node["railway"~"^(station|halt|tram_stop)$"]('+coords+');'+
     'node["station"="subway"]('+coords+');'+
     (showBus?'node["highway"="bus_stop"]('+coords+');':'')+
     ');out center tags 250;';
   for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
    try{
     const res=await fetch(endpoint+'?data='+encodeURIComponent(query),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12500)});
     if(!res.ok)continue;const d=await res.json();if(!Array.isArray(d.elements))continue;
     features=d.elements;overpassCache.set(key,features);break;
    }catch(e){console.warn('Overpass unavailable',e)}
   }
   if(!features)throw Error('TfL and OpenStreetMap transport services unavailable');
  }
 }
 if(current!==transitVersion)return;
 transportLayer.clearLayers();
 const seen=new Set();let rails=0,buses=0;
 for(const t of features){
  const lat=Number(t.lat??t.center?.lat),lon=Number(t.lon??t.center?.lon),tags=t.tags||{};
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!bounds.contains([lat,lon]))continue;
  const name=String(tags.name||'').trim();
  const isBus=tags.highway==='bus_stop',isTram=tags.railway==='tram_stop';
  const isTube=tags.station==='subway'||String(tags.network||'').toLowerCase().includes('underground')||name.toLowerCase().includes('underground');
  const signature=[isBus?'bus':'rail',name.toLowerCase(),lat.toFixed(3),lon.toFixed(3)].join('|');
  if(seen.has(signature))continue;seen.add(signature);
  if(isBus)buses++;else rails++;
  const iconContent=isBus?'🚌':isTram?'🚋':isTube?'Ⓜ':'🚆';
  const iconClass=isBus?'hh-transit-bus':isTube?'hh-transit-tube':isTram?'hh-transit-tram':'hh-transit-rail';
  const icon=L.divIcon({className:'hh-transit-icon '+iconClass,html:'<span>'+iconContent+'</span>',iconSize:[22,22],iconAnchor:[11,11]});
  const marker=L.marker([lat,lon],{icon,interactive:true,keyboard:false});
  const title=name||(isBus?'Bus stop':isTram?'Tram stop':isTube?'Tube station':'Rail station');
  marker.bindTooltip(title,{direction:'top'});
  const box=node('div'),heading=node('strong','',title),type=node('div','hh-map-kind',isBus?'Bus stop':isTram?'Tram stop':isTube?'Underground':'Rail station');
  box.append(heading,type);
  if(tags.ref)box.append(node('div','',tags.ref));
  marker.bindPopup(box);marker.addTo(transportLayer);
 }
 transitInfo.textContent='🚆 Train · Ⓜ Underground · 🚋 Tram · 🚌 Bus · '+rails+' stations'+(showBus?' · '+buses+' bus stops':' · zoom in for bus stops')+' · TfL / OpenStreetMap';
}
function redraw(){
 if(!map||!markers)return;
 const signature=JSON.stringify(rows.map(p=>[p.id,p.latitude,p.longitude,p.price,p.address]));
 if(signature===lastMapSig)return;
 lastMapSig=signature;
 markers.clearLayers();missingDiv.replaceChildren();
 const groups=new Map(),miss=[],bounds=[];
 for(const p of rows){
  if(p.latitude==null||p.longitude==null||!Number.isFinite(Number(p.latitude))||!Number.isFinite(Number(p.longitude))){miss.push(p);continue}
  const point=[Number(p.latitude),Number(p.longitude)];
  if(point[0]<49||point[0]>61||point[1]<-9||point[1]>3){miss.push(p);continue}
  const k=point.join(',');
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(p);
 }
 let placed=0,shared=0;
 for(const g of groups.values()){
  placed+=g.length;if(g.length>1)shared+=g.length;
  const coord=[Number(g[0].latitude),Number(g[0].longitude)];
  bounds.push(coord);
  const popup=node('div','hh-property-popup');
  popup.append(node('strong','',g.length>1?g.length+' houses at this location':clean(g[0].address)));
  for(const p of g){
   const line=node('div','hh-map-house-line');
   const b=node('button','',clean(p.address)+' · '+money(p.price));b.onclick=()=>openHouse(p);
   const gm=node('a','hh-map-gm','Google Maps ↗');gm.href=mapsFor(p);gm.target='_blank';gm.rel='noopener noreferrer';
   line.append(b,gm);popup.append(line);
  }
  const icon=L.divIcon({className:'hh-property-pin-wrapper',html:'<div class="hh-property-pin">'+(g.length>1?String(g.length):'⌂')+'</div>',iconSize:[35,39],iconAnchor:[17,36]});
  L.marker(coord,{icon,zIndexOffset:1000}).addTo(markers).bindPopup(popup,{maxWidth:300});
 }
 if(!mapFramed&&bounds.length){
  mapFramed=true;
  if(bounds.length===1)map.setView(bounds[0],14);
  else map.fitBounds(bounds,{padding:[35,35],maxZoom:14});
 }
 mapMsg.textContent=placed+' homes on map'+(shared?' · '+shared+' homes share a pin':'')+' · '+groups.size+' locations. Pins from listing sites may be approximate.';
 if(miss.length){
  missingDiv.append(node('span','hh-help',miss.length+' without coordinates: '));
  for(const p of miss){
   const b=node('button','',clean(p.address)+' · Locate');
   b.onclick=async()=>{b.disabled=true;try{if(await postcodeLocate(p)){flash('Postcode located');redraw()}else{b.disabled=false;b.textContent='Postcode unavailable'}}catch(e){b.disabled=false;flash(e.message,true)}};
   missingDiv.append(b);
  }
 }
 scheduleTransport();
}

return {render,open,edited};
}
