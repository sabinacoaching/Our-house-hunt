import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectAgencyWebsite,parseSearchResponse} from '../server/house-hunt-agency-search/select.js';
const fixture=JSON.parse(readFileSync(new URL('./agency-search-live-fixture.json',import.meta.url),'utf8'));
const cases=[
 ['Oakhill','6 South Street, Isleworth TW7 7BG','oakhillagents.co.uk'],
 ['Stirling Ackroyd - Whitton','127 Percy Road, Whitton','stirlingackroyd.com'],
 ['Dexters - Isleworth','568 London Road, Isleworth TW7 4EP','dexters.co.uk'],
 ['Hunters - Brentford','Brentford','hunters.com']
];
test('real search results find the matching agency and its branch',()=>{
 for(let i=0;i<cases.length;i++){
  const [name,address,domain]=cases[i];const url=selectAgencyWebsite(name,address,fixture[i].results);
  assert.ok(url,`${name} not found`);assert.ok(new URL(url).hostname.endsWith(domain));
 }
});
test('a different branch or a directory is not accepted',()=>{
 const results=[{url:'https://directory.example.com/oakhill',title:'Oakhill Isleworth',snippets:['TW7 7BG']},{url:'https://oakhillagents.co.uk/contact',title:'Oakhill Richmond',snippets:['99 High Street, Richmond TW9 1AA']}];
 assert.equal(selectAgencyWebsite('Oakhill','6 South Street Isleworth TW7 7BG',results),null);
});
test('MCP event stream extracts the final search result',()=>{
 const input='event: message\ndata: '+JSON.stringify({method:'notifications/message',params:{level:'info'}})+'\n\nevent: message\ndata: '+JSON.stringify({id:1,result:{content:[{type:'text',text:JSON.stringify({results:{web:fixture[0].results}})}]}})+'\n\n';
 assert.equal(parseSearchResponse(input)[2].url,'https://www.oakhillagents.co.uk/contact/');
});
