import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectAgencyWebsite,parseSearchResponse} from '../server/house-hunt-agency-search/select.js';
const fixture=JSON.parse(readFileSync(new URL('./agency-search-live-fixture.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../server/house-hunt-agency-search/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/\)!/g,')').replace(/:(?:unknown|Request|any)\b/g,'');
function makeHandler(){
 let handler,query;
 const admin={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'member'}})})};
 const fetch=async(_,options)=>{query=JSON.parse(options.body).params.arguments.query;const event={id:1,result:{content:[{type:'text',text:JSON.stringify({results:{web:fixture[0].results}})}]}};return {ok:true,text:async()=>`event: message\ndata: ${JSON.stringify(event)}\n\n`}};
 new Function('Deno','createClient','fetch','Response','AbortSignal','parseSearchResponse','selectAgencyWebsite',source)({env:{get:()=>''},serve:fn=>{handler=fn}},()=>admin,fetch,Response,AbortSignal,parseSearchResponse,selectAgencyWebsite);
 return {handler,query:()=>query};
}
test('authenticated website search returns the verified branch from real results',async()=>{
 const a=makeHandler();const response=await a.handler(new Request('https://example.com',{method:'POST',headers:{authorization:'Bearer token'},body:JSON.stringify({name:'Oakhill',address:'6 South Street Isleworth TW7 7BG'})}));
 assert.equal(response.status,200);assert.equal((await response.json()).website,'https://www.oakhillagents.co.uk/contact/');
 assert.match(a.query(),/Oakhill 6 South Street Isleworth TW7 7BG/);
});
test('website search rejects callers without a session',async()=>{
 const a=makeHandler();const response=await a.handler(new Request('https://example.com',{method:'POST'}));assert.equal(response.status,401);
});
