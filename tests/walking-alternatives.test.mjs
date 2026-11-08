import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walkingAlternatives} from '../server/house-hunt-journeys/walking-alternatives.js';
import {selectJourney} from '../server/house-hunt-journeys/select.js';
const origin={lat:51.3770119,lon:-.0867585},station={lat:51.375489682084,lon:-.092878719631},stop={id:'490009543W',lat:51.45799,lon:-.20736,distance:44},destination={lat:51.458147670539,lon:-.20842143179,commonName:'63 UPPER RICHMOND ROAD'};
const journey={startDateTime:'2026-11-10T19:05:00',arrivalDateTime:'2026-11-10T19:46:00',duration:41,legs:[{mode:{id:'walking'},departureTime:'2026-11-10T19:05:00',arrivalTime:'2026-11-10T19:18:00',departurePoint:origin,arrivalPoint:station},{mode:{id:'national-rail'}},{mode:{id:'bus'},arrivalPoint:stop}]};
const slow={startDateTime:'2026-11-10T18:53:00',arrivalDateTime:'2026-11-10T19:47:00',duration:54,legs:[{mode:{id:'tram'}}]};
function mock({unavailable=false,farStop=false}={}){return async url=>{
 if(String(url).includes('routed-foot'))return {ok:!unavailable,json:async()=>({code:'Ok',routes:[{duration:String(url).includes('51.3770119')?522.8:68.4,distance:String(url).includes('51.3770119')?653:83}],waypoints:[{distance:1},{distance:2}]})};
 if(String(url).includes('/StopPoint?'))return {ok:true,json:async()=>({stopPoints:[stop]})};
 if(String(url).includes('/Journey/JourneyResults/'))return {ok:true,json:async()=>({journeys:[farStop?{...journey,legs:[...journey.legs.slice(0,-1),{mode:{id:'bus'},arrivalPoint:{lat:52,lon:-.2}}]}:journey]})};
 throw Error('unexpected request '+url);
}}
test('finds a nearer bus stop and recomputes only actual walking legs',async()=>{
 const extra=await walkingAlternatives({fetchFn:mock(),origin,destination,date:'20261110',deadline:Date.parse('2026-11-10T19:50:00Z'),journeys:[]});
 const selected=selectJourney([slow,...extra],Date.parse('2026-11-10T19:50:00Z'));
 assert.equal(selected.startDateTime,'2026-11-10T19:09:00');assert.equal(selected.arrivalDateTime,'2026-11-10T19:47:00');assert.equal(selected.duration,38);
 assert.equal(selected.legs[1].mode.id,'national-rail');assert.equal(selected.legs[2].mode.id,'bus');assert.equal(selected.legs.at(-1).duration,1);
});
test('does not invent a replacement when walking data is unavailable or transit ends elsewhere',async()=>{
 for(const options of [{unavailable:true},{farStop:true}])assert.deepEqual(await walkingAlternatives({fetchFn:mock(options),origin,destination,date:'20261110',deadline:Date.parse('2026-11-10T19:50:00Z'),journeys:[]}),[]);
});
