import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const path=process.env.HH_EXTENSION_PATH||fileURLToPath(new URL('../extension',import.meta.url));
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,locale:process.env.HH_LOCALE||'en-GB',timezoneId:'Europe/London',args:['--disable-extensions-except='+path,'--load-extension='+path]});
context.on('page',page=>{page.on('pageerror',e=>console.log('PAGE_ERROR '+e.message))});
try{
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 await context.pages()[0].bringToFront();
 await worker.evaluate(()=>{globalThis.capturedInjections=[];const original=chrome.scripting.executeScript.bind(chrome.scripting);chrome.scripting.executeScript=async(...args)=>{const before=await original({target:args[0].target,func:()=>({hidden:document.hidden,url:location.href,time:document.querySelector('input[name="transit-time"]')?.value||null})});const out=await original(...args);globalThis.capturedInjections.push({before,out});return out}});
 for(const kind of ['station_walk','waterloo','station_transit']){
  const start=Date.now();
  const result=await worker.evaluate(async kind=>{try{return {ok:true,value:await googleRoute({kind,origin:{lat:51.4631369,lon:-.3552057},destination:{lat:51.46223,lon:-.36195}})}}catch(error){return {ok:false,error:String(error),injections:globalThis.capturedInjections.splice(0)}}},kind);
  console.log('NATIVE_RESULT '+JSON.stringify({phase:process.env.HH_BASELINE?'baseline':'candidate',kind,ms:Date.now()-start,...result}));
  if(!result.ok&&!process.env.HH_BASELINE)process.exitCode=1;
 }
}finally{await context.close()}
