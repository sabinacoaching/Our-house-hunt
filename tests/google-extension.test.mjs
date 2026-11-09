import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const parser=readFileSync(new URL('../extension/google-route-parser.js',import.meta.url),'utf8');
function setup(challenge=false){let closed=0,opened=[],listener;
 const chrome={tabs:{create:async info=>{opened.push(info.url);return {id:42}},get:async()=>({status:'complete'}),remove:async()=>{closed++},onUpdated:{addListener(){},removeListener(){}}},scripting:{executeScript:async({args})=>{if(challenge)throw Error('GOOGLE_VERIFICATION_REQUIRED');assert.equal(args[0].mode,'arrive');return [{result:{url:'https://www.google.com/maps/test',rows:[{duration:'38 min',heading:'7:09 PM—7:47 PM',modes:['Train','Bus']},{duration:'37 min',heading:'7:03 PM—7:40 PM',modes:['Train']}]}}]}},runtime:{onMessage:{addListener:fn=>{listener=fn}}}};
 const context=vm.createContext({chrome,URL,URLSearchParams,Intl,Date,setTimeout,clearTimeout,console});vm.runInContext(parser,context);vm.runInContext('async function houseHuntReadMapsPage() {}',context);vm.runInContext(code,context);
 return {context,opened,closed:()=>closed,listener:()=>listener};
}
test('extension requests Google with the supplied origin, returns the five-minute result and closes the tab',async()=>{const x=setup(),v=await x.context.googleRoute({kind:'dancelab',origin:{lat:51.41,lon:-.31}});assert.equal(v.minutes,38);assert.equal(v.origin,'51.41,-0.31');assert.equal(v.desired_arrival,'19:50');assert.equal(new URL(x.opened[0]).searchParams.get('origin'),'51.41,-0.31');assert.equal(x.closed(),1)});
test('verification screen stops without leaving an open tab',async()=>{const x=setup(true);await assert.rejects(()=>x.context.googleRoute({kind:'dancelab',origin:{lat:51.41,lon:-.31}}),/GOOGLE_VERIFICATION_REQUIRED/);assert.equal(x.closed(),1)});
test('route requests from unrelated websites are ignored',()=>{const x=setup();assert.equal(x.listener()({action:'GOOGLE_ROUTE'},{url:'https://other.example/'},()=>{}),false)});
