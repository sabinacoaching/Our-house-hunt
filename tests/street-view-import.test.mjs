import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const body=html.slice(html.indexOf(' const hint=data.location_hint;'),html.indexOf(' p.import_diagnostics.route_pending=true;'));
function run(hint,address='Sussex Avenue, Isleworth TW7'){
 const p={address,latitude:null,longitude:null,import_diagnostics:{}},data={location_hint:hint},url='https://www.zoopla.co.uk/for-sale/details/123';
 new Function('p','data','url',body)(p,data,url);return p;
}
test('source panorama populates a new home and retains its provenance',()=>{
 const p=run({source:'listing-street-view',latitude:51.4681168,longitude:-0.3424992,address:'88 Sussex Ave, Isleworth, England'});
 assert.equal(p.address,'88 Sussex Ave, Isleworth, England');assert.equal(p.latitude,51.4681168);assert.equal(p.import_diagnostics.source_location.address_input,p.address);
});
test('a numbered original address is not replaced and invalid coordinates are ignored',()=>{
 const p=run({source:'listing-street-view',latitude:51.46,longitude:-0.34,address:'88 Sussex Ave'},'90 Sussex Avenue');assert.equal(p.address,'90 Sussex Avenue');
 assert.equal(run({source:'listing-street-view',latitude:0,longitude:0,address:'88 Sussex Ave'}).latitude,null);
 assert.equal(run({source:'unrelated',latitude:51.46,longitude:-0.34,address:'88 Sussex Ave'}).latitude,null);
});
