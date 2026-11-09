import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const extensionPath=fileURLToPath(new URL('../extension',import.meta.url));
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,locale:'en-GB',timezoneId:'Europe/London',args:['--disable-extensions-except='+extensionPath,'--load-extension='+extensionPath]});
try{
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 await context.pages()[0].bringToFront();
 await worker.evaluate(()=>{
  const original=chrome.scripting.executeScript.bind(chrome.scripting);
  globalThis.diagnostics=[];
  chrome.scripting.executeScript=async request=>{
   const snap=async()=>{const r=await original({target:request.target,func:()=>({title:document.title,h1:[...document.querySelectorAll('h1')].map(x=>({text:x.textContent,visible:!!x.getClientRects().length})),tabs:[...document.querySelectorAll('[role="tab"]')].map(x=>({text:x.textContent,selected:x.getAttribute('aria-selected')})),panels:[...document.querySelectorAll('[role="tabpanel"]')].map(x=>({id:x.id,text:x.innerText?.slice(0,1500)})),inputs:[...document.querySelectorAll('input[aria-label]')].map(x=>({label:x.getAttribute('aria-label'),value:x.value})),url:location.href})});return r[0]?.result};
   const before=await snap(),out=await original(request),after=await snap();
   globalThis.diagnostics.push({function:request.func?.name,before,after,result:request.func?.name==='houseHuntReadMapsPage'?out[0]?.result:undefined});
   if(request.func?.name==='readPropertyFromPage'){
    const extra=await original({target:request.target,func:async()=>{
     const heading=[...document.querySelectorAll('h2')].find(x=>/local area information/i.test(x.textContent)),region=heading?.closest('section,[role="region"]')||heading?.parentElement;
     region?.scrollIntoView();await new Promise(r=>setTimeout(r,4000));
     const transports=[...document.querySelectorAll('svg,title,img')].map(x=>({text:x.textContent?.trim(),alt:x.getAttribute('alt'),'aria-label':x.getAttribute('aria-label')})).filter(x=>/train|tube|tram|rail/i.test(JSON.stringify(x))).slice(0,30);
     return {localArea:region?.innerText,localAreaHTML:region?.outerHTML?.slice(0,16000),transports};
    }});globalThis.diagnostics.push({localArea:extra[0]?.result});
   }
   return out;
  };
 });
 for(const id of ['74462725','74553564']){
  const result=await worker.evaluate(async id=>{try{const value=await extract('https://www.zoopla.co.uk/for-sale/details/'+id+'/?console=open&tab=street_view');return {ok:true,value:{address:value.address,title:value.title,point:value.location_hint,version:value.extension_version,station:value.station_name,images:value.images?.length,plans:value.floorplans?.length}}}catch(error){return {ok:false,error:String(error)}}},id);
  const diagnostics=await worker.evaluate(()=>globalThis.diagnostics.splice(0));
  console.log('DIAG_LISTING '+JSON.stringify({id,result,diagnostics}));
 }
 for(const name of ['East Croydon train station','South Croydon train station']){
  const result=await worker.evaluate(async name=>{
   const origin='51.3694953,-0.0883864',url='https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin,destination:name,travelmode:'walking',hl:'en'});
   const tab=await chrome.tabs.create({url,active:false});try{
    await waitForLoad(tab.id);const r=await chrome.scripting.executeScript({target:{tabId:tab.id},func:houseHuntReadMapsPage,args:[{origin,destination:name,destinationKind:'fixed',destinationCheck:[name.split(' ').slice(0,2).join('').toLowerCase()],mode:'walking'}]});return r[0]?.result;
   }finally{await chrome.tabs.remove(tab.id)}
  },name);console.log('DIAG_NAMED_STATION '+JSON.stringify({name,result,diagnostics:await worker.evaluate(()=>globalThis.diagnostics.splice(0))}));
 }
 const route=await worker.evaluate(async()=>{try{return await googleRoute({kind:'waterloo',origin:{lat:51.3694953,lon:-.0883864}})}catch(error){return {error:String(error)}}});
 console.log('DIAG_WATERLOO '+JSON.stringify({route,diagnostics:await worker.evaluate(()=>globalThis.diagnostics.splice(0))}));
}finally{await context.close()}
