import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const parser=readFileSync(new URL('../extension/google-route-parser.js',import.meta.url),'utf8');
function setup(challenge=false,walkingOnly=false){let closed=0,opened=[],listener;
 const chrome={tabs:{create:async info=>{opened.push(info.url);return {id:42}},get:async()=>({status:'complete'}),remove:async()=>{closed++},onUpdated:{addListener(){},removeListener(){}}},scripting:{executeScript:async({args})=>{if(challenge)throw Error('GOOGLE_VERIFICATION_REQUIRED');if(walkingOnly){assert.equal(args[0].mode,'depart');return [{result:{url:'https://www.google.com/maps/test',rows:[{duration:'8 min',heading:'via Cedar Rd and Billinton Hill',distance:'0.4 mile',modes:['Walking']}]}}]}assert.ok(['arrive','depart'].includes(args[0].mode));return [{result:{url:'https://www.google.com/maps/test',rows:[{duration:'38 min',heading:'7:09 PM—7:47 PM',modes:['Train','Bus']},{duration:'37 min',heading:'7:03 PM—7:40 PM',modes:['Train']}]}}]}},runtime:{onMessage:{addListener:fn=>{listener=fn}}}};
 const context=vm.createContext({chrome,URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,console});vm.runInContext(parser,context);vm.runInContext('async function houseHuntReadMapsPage() {}',context);vm.runInContext(code,context);
 return {context,opened,closed:()=>closed,listener:()=>listener};
}
test('extension opens a scheduled Maps URL with the supplied origin and returns the five-minute result',async()=>{const x=setup(),v=await x.context.googleRoute({kind:'dancelab',origin:{lat:51.41,lon:-.31}});assert.equal(v.minutes,38);assert.equal(v.origin,'51.41,-0.31');assert.equal(v.desired_arrival,'19:50');assert.ok(decodeURIComponent(new URL(x.opened[0]).pathname).includes('51.41,-0.31'));assert.match(x.opened[0],/!6e1!7e2!8j\d+!3e3/);assert.equal(x.closed(),x.opened.length)});
test('verification screen stops without leaving an open tab',async()=>{const x=setup(true);await assert.rejects(()=>x.context.googleRoute({kind:'dancelab',origin:{lat:51.41,lon:-.31}}),/GOOGLE_VERIFICATION_REQUIRED/);assert.equal(x.closed(),x.opened.length)});
test('scheduled Maps timestamps use London daylight saving time',()=>{const x=setup();assert.equal(new Date(x.context.googleLondonTimestamp('2026-07-07','07:40')*1000).toISOString(),'2026-07-07T06:40:00.000Z');assert.equal(new Date(x.context.googleLondonTimestamp('2026-11-10','07:40')*1000).toISOString(),'2026-11-10T07:40:00.000Z')});
test('route requests from unrelated websites are ignored',()=>{const x=setup();assert.equal(x.listener()({action:'GOOGLE_ROUTE'},{url:'https://other.example/'},()=>{}),false)});

test('Google walking-only station card is treated as no public transport',async()=>{const x=setup(false,true),v=await x.context.googleRoute({kind:'station_transit',origin:{lat:51.3770119,lon:-.0867585},destination:{lat:51.37487,lon:-.09289}});assert.equal(v.unavailable,true);assert.equal(v.source,'Google Maps');assert.equal(x.closed(),x.opened.length)});

test('named station validation accepts a reordered Google label such as East Underground Station in Hounslow',async()=>{
 let request;
 const chrome={tabs:{create:async()=>({id:1}),get:async()=>({status:'complete'}),remove:async()=>{},onUpdated:{addListener(){},removeListener(){}}},runtime:{onMessage:{addListener(){}}},scripting:{executeScript:async({args})=>{request=args[0];return [{result:{url:'https://www.google.com/maps/test',rows:[{duration:'18 min',distance:'0.8 mile',heading:'via Kingsley Road',modes:['Walking']}]}}]}}};
 const context=vm.createContext({chrome,URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,console});
 vm.runInContext(parser,context);vm.runInContext('async function houseHuntReadMapsPage(){}',context);vm.runInContext(code,context);
 const result=await context.googleRoute({kind:'station_walk',origin:{lat:51.4631369,lon:-.3552057},destination:{name:'Hounslow East Underground',station_id:'940GZZLUHWE',transport_type:'tube',query:'Hounslow East Underground Station, London, UK'}});
 assert.deepEqual(Array.from(request.destinationCheck),['hounslow','east']);
 assert.equal(request.destinationKind,'fixed');assert.equal(result.station_id,'940GZZLUHWE');
});

test('a faster earlier Google itinerary triggers a later-departure lookup and the real returned 07:38 trip wins',async()=>{
 const opened=[],closed=[],requests=[];
 const chrome={tabs:{create:async info=>{opened.push(info.url);return {id:opened.length}},get:async()=>({status:'complete'}),remove:async id=>closed.push(id),onUpdated:{addListener(){},removeListener(){}}},runtime:{onMessage:{addListener(){}}},scripting:{executeScript:async({args})=>{
  const request=args[0];requests.push(request);
  const rows=request.mode==='depart'?[{duration:'41 min',heading:'6:57 AM-7:38 AM',modes:['Train']},{duration:'44 min',heading:'7:04 AM-7:48 AM',modes:['Train']}]:[{duration:'41 min',heading:'6:42 AM-7:23 AM',modes:['Train']},{duration:'53 min',heading:'6:46 AM-7:39 AM',modes:['Train']}];
  return [{result:{url:'https://www.google.com/maps/test',rows}}];
 }}};
 const context=vm.createContext({chrome,URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,console});
 vm.runInContext(parser,context);vm.runInContext('async function houseHuntReadMapsPage(){}',context);vm.runInContext(code,context);
 const result=await context.googleRoute({kind:'waterloo',origin:{lat:51.3694953,lon:-.0883864}});
 assert.equal(result.minutes,41);assert.ok(result.departure.endsWith('T06:57:00'));assert.ok(result.arrival.endsWith('T07:38:00'));
 assert.equal(result.departure_probe,'checked');assert.deepEqual(requests.map(x=>x.mode),['arrive','depart']);
 assert.equal(requests[1].time24,'06:54');assert.equal(opened.length,2);assert.equal(closed.length,2);
 assert.match(opened[1],/!6e0!/);
});
