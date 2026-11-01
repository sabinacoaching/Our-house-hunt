import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function lookupAgencyWebsite(data){');
const end=html.indexOf('async function importHouse(raw){',start);
const fn=html.slice(start,end);
function setup(response){let called;const sb={functions:{invoke:async(name,args)=>{called={name,args};return response}}};return {lookup:new Function('sb',fn+';return lookupAgencyWebsite')(sb),called:()=>called}}
test('new import searches using agency name and branch address',async()=>{
 const s=setup({data:{website:'https://www.oakhillagents.co.uk/contact/'}});
 const site=await s.lookup({agency_name:'Oakhill',agency_address:'6 South Street Isleworth TW7 7BG'});
 assert.equal(site,'https://www.oakhillagents.co.uk/contact/');
 assert.deepEqual(s.called(),{name:'house-hunt-agency-search',args:{body:{name:'Oakhill',address:'6 South Street Isleworth TW7 7BG'}}});
 assert.match(html,/data\.agency_website=await lookupAgencyWebsite\(data\)/);
});
test('an unavailable search does not stop the property import',async()=>{
 const s=setup({error:new Error('offline')});
 assert.equal(await s.lookup({agency_name:'Oakhill',agency_address:'6 South Street Isleworth TW7 7BG'}),null);
});
test('the property address is not substituted for a missing agency address',async()=>{
 const s=setup({data:{website:'https://wrong.example'}});
 assert.equal(await s.lookup({agency_name:'Oakhill',address:'37 Longford Road'}),null);
 assert.equal(s.called(),undefined);
});
