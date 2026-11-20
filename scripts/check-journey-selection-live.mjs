// Focused regression check for the changed journey policy. The full catalogue
// check is retained in check-routing-live.mjs; station discovery is unchanged.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const path=resolve('extension');
const browser=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,locale:'en-GB',timezoneId:'Europe/London',args:['--disable-extensions-except='+path,'--load-extension='+path]});
try{
 let [worker]=browser.serviceWorkers();if(!worker)worker=await browser.waitForEvent('serviceworker');
 for(const [house,origin,kinds] of [['Alpine Close',{lat:51.3694953,lon:-.0883864},['waterloo','dilly','dancelab']],['Tamworth Lane',{lat:51.4032072,lon:-.1495626},['dancelab']]]){
  for(const kind of kinds){
   const result=await worker.evaluate(route=>googleRoute(route),{kind,origin});
   assert.equal(result.selection_version,'departure-balanced-v2');assert.ok(result.minutes>0);assert.ok(result.walking_legs.length>0);assert.ok(result.selected_candidates.length>0);
   assert.equal(result.walking_deprioritized,result.max_walk_minutes>=17);assert.equal(result.warning_two_transfers,result.transfers>=2);
   assert.ok(result.arrival.slice(11,16)<=result.desired_arrival);
   if(house==='Tamworth Lane'){assert.ok(result.max_walk_minutes<17);assert.ok(result.minutes<=50,'Do not choose the long walk tram or dominated 63-minute bus')}
   console.log('JOURNEY_SELECTION_PASS',JSON.stringify({house,kind,minutes:result.minutes,departure:result.departure,arrival:result.arrival,max_walk_minutes:result.max_walk_minutes,transfers:result.transfers,candidates:result.selected_candidates}));
  }
 }
}finally{await browser.close()}
