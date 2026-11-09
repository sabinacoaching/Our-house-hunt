import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validStreetViewHint,sameStreet,streetViewListingUrl} from '../import-utils.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const body=html.slice(html.indexOf(' const hint=data.location_hint;'),html.indexOf(' p.import_diagnostics.route_pending=true;'));
function run(hint,address='Sussex Avenue, Isleworth TW7'){
 const p={address,latitude:null,longitude:null,import_diagnostics:{}},data={location_hint:hint},url='https://www.zoopla.co.uk/for-sale/details/123';
 new Function('p','data','url','validStreetViewHint','sameStreet',body)(p,data,url,validStreetViewHint,sameStreet);return p;
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
test('an approximate listing map point is not accepted as the house location',()=>{
 const p=run({source:'listing-map',latitude:51.48116,longitude:-0.356191});
 assert.equal(p.address,'Sussex Avenue, Isleworth TW7');assert.equal(p.latitude,null);assert.equal(p.import_diagnostics.source_location,undefined);
});

test('uses the listing panorama on a neighbouring road without replacing the listing address',()=>{
 const p=run({source:'listing-street-view',latitude:51.3694953,longitude:-.0883864,address:'18 Chichester Rd, Croydon, England'},'Alpine Close, Park Hill CR0');assert.equal(p.latitude,51.3694953);assert.equal(p.address,'Alpine Close, Park Hill CR0');assert.equal(p.import_diagnostics.source_location.display_address,'18 Chichester Rd, Croydon, England');
});
test('Zoopla source opens Street View directly without changing other listing URLs',()=>{const u=new URL(streetViewListingUrl('https://www.zoopla.co.uk/for-sale/details/74553564'));assert.equal(u.searchParams.get('console'),'open');assert.equal(u.searchParams.get('tab'),'street_view');assert.equal(streetViewListingUrl('https://www.rightmove.co.uk/properties/123'),'https://www.rightmove.co.uk/properties/123')});
test('a Street View point on the correct road is usable without a house number',()=>{
 assert.equal(validStreetViewHint({source:'listing-street-view',address:'Cedar Rd, Croydon',latitude:51.377,longitude:-.086},'Cedar Road, Croydon'),true);
});
test('the Lyncroft listing accepts its Central Avenue panorama while keeping the advertised street',()=>{
 const p=run({source:'listing-street-view',address:'34 Central Ave, Hounslow, England',latitude:51.4631369,longitude:-.3552057},'Lyncroft Gardens, Hounslow TW3');
 assert.equal(p.latitude,51.4631369);assert.equal(p.address,'Lyncroft Gardens, Hounslow TW3');
});
test('the Rossindel listing accepts the panorama displayed on its own street',()=>{
 const p=run({source:'listing-street-view',address:'8 Rossindel Rd, Hounslow, England',latitude:51.4621708,longitude:-.3708626},'Rossindel Road, Hounslow TW3');
 assert.equal(p.latitude,51.4621708);assert.equal(p.address,'8 Rossindel Rd, Hounslow, England');
});
