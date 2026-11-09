import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../extension',import.meta.url));
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,locale:'en-GB',timezoneId:'Europe/London',args:['--disable-extensions-except='+path,'--load-extension='+path]});
try{
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 await context.pages()[0].bringToFront();
 for(const [origin,destination,mode] of [
 ['51.3694953,-0.0883864','East Croydon','walking'],
 ['51.3694953,-0.0883864','East Croydon railway station','walking'],
 ['51.3694953,-0.0883864','South Croydon','walking'],
 ['Alpine Close, Park Hill CR0','East Croydon','walking'],
 ['51.3694953,-0.0883864','Waterloo station','arrive'],
 ['Alpine Close, Park Hill CR0','Waterloo station','arrive']
 ]){
  const result=await worker.evaluate(async({origin,destination,mode})=>{
   const date=londonNextTuesday().toISOString().slice(0,10),time24='07:40';
   const url=mode==='walking'?'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin,destination,travelmode:'walking',hl:'en'}):'https://www.google.com/maps/dir/'+encodeURIComponent(origin)+'/'+encodeURIComponent(destination)+'/data=!4m6!4m5!2m3!6e1!7e2!8j'+googleLondonTimestamp(date,time24)+'!3e3?hl=en';
   const tab=await chrome.tabs.create({url,active:false});try{
    await waitForLoad(tab.id);const r=await chrome.scripting.executeScript({target:{tabId:tab.id},func:houseHuntReadMapsPage,args:[{origin,destination,destinationKind:'fixed',destinationCheck:[destination.startsWith('Waterloo')?'waterloo':destination.startsWith('South')?'southcroydon':'eastcroydon'],mode,date,time24}]});
    const inputs=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>[...document.querySelectorAll('input[aria-label]')].map(x=>({label:x.getAttribute('aria-label'),value:x.value}))});
    return {value:r[0]?.result,inputs:inputs[0]?.result};
   }finally{await chrome.tabs.remove(tab.id)}
  },{origin,destination,mode});
  console.log('GOOGLE_DESTINATION_DIAG '+JSON.stringify({origin,destination,mode,...result}));
 }
}finally{await context.close()}
