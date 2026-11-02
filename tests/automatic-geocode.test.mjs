import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateGeocode} from '../import-utils.js';
import {verifiedLocation} from '../server/house-hunt-journeys/select.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('async function enrichWalkingStations('),html.indexOf('// Existing catalogue files'));
// This is the shape of a real Nominatim building response for the saved address.
const building={lat:'51.4457332',lon:'-0.3675938',display_name:'37, Longford Road, Whitton, Twickenham, Greater London, England, TW2 6EB, United Kingdom',address:{house_number:'37',road:'Longford Road',town:'Twickenham',postcode:'TW2 6EB',country_code:'gb'}};
function setup(candidate=building){
 const p={id:'house',address:'37 Longford Road, Twickenham',latitude:null,longitude:null,import_diagnostics:{route_pending:true}};
 let saved=null;
 const sb={from(){const chain={update(x){saved=x;return this},eq(){return this},is(){return this},select(){return this},maybeSingle:async()=>({data:{id:p.id}})};return chain}};
 const fetch=async url=>String(url).includes('nominatim')?{ok:true,json:async()=>[candidate]}:{ok:true,json:async()=>({elements:[]})};
 const enrich=new Function('sb','fetch','validateGeocode','routeDelay','refresh','haversine',code+';return enrichWalkingStations')(sb,fetch,validateGeocode,async()=>{},async()=>{},()=>0);
 return {p,enrich,saved:()=>saved};
}
test('new import stores a confirmed address point that the journey endpoint can use',async()=>{
 const x=setup();await x.enrich(x.p);
 assert.equal(x.saved().import_diagnostics.route_pending,true);
 assert.deepEqual(verifiedLocation(x.p),{lat:51.4457332,lon:-0.3675938});
});
test('a different numbered building does not become a routing origin',async()=>{
 const x=setup({...building,address:{...building.address,house_number:'44'}});await x.enrich(x.p);
 assert.equal(x.saved(),null);assert.equal(verifiedLocation(x.p),null);
});
test('Street View coordinates belong to the same listing and current address',()=>{
 const p={url:'https://www.zoopla.co.uk/for-sale/details/123',address:'88 Sussex Ave, Isleworth',latitude:51.4681168,longitude:-0.3424992};
 p.import_diagnostics={source_location:{source:'listing-street-view',listing_url:p.url,address_input:p.address,latitude:p.latitude,longitude:p.longitude}};
 assert.deepEqual(verifiedLocation(p),{lat:p.latitude,lon:p.longitude});
 assert.equal(verifiedLocation({...p,address:'Another road'}),null);
 assert.equal(verifiedLocation({...p,url:'https://www.zoopla.co.uk/for-sale/details/456'}),null);
 assert.equal(verifiedLocation({...p,latitude:51.47}),null);
});
