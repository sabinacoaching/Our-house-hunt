import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildLocationUpdate} from '../location-update.js';

const hint={source:'listing-street-view',address:'101 Cedar Rd, Croydon',latitude:51.3770119,longitude:-.0867585};
const p={id:'house',url:'https://www.zoopla.co.uk/for-sale/details/73761901',address:'101 Cedar Road, East Croydon',latitude:51.377,longitude:-.0867,
 manual_overrides:{station_2_name:true,station_2_distance_miles:true},station_name:'East Croydon',station_2_name:'Manual station',station_distance_miles:.4,station_2_distance_miles:.6,
 station_commutes:{google_verified:{'Manual station':{walking_minutes:15,source:'manual'}},tfl_final:{origin:'old'}},journey_estimates:{dancelab:{minutes:42,manual_override:true},dilly:{minutes:55,source:'TfL'}},import_diagnostics:{source_location:{address_input:'Cedar Road, East Croydon'}}};
test('a corrected address changes the location and preserves manual routes and station edits',()=>{
 const u=buildLocationUpdate(p,hint);
 assert.equal(u.latitude,hint.latitude);assert.equal(u.import_diagnostics.route_pending,true);
 assert.deepEqual(u.journey_estimates,{dancelab:{minutes:42,manual_override:true}});
 assert.deepEqual(u.station_commutes.google_verified,p.station_commutes.google_verified);
 assert.equal(u.station_name,'');assert.equal(u.station_distance_miles,null);
 assert.ok(!Object.hasOwn(u,'station_2_name'));assert.ok(!Object.hasOwn(u,'station_2_distance_miles'));
 assert.deepEqual(u.import_diagnostics.routing_history[0].journeys,p.journey_estimates);
});
test('a map pin, a different street, or manually fixed coordinates cannot replace the origin',()=>{
 assert.equal(buildLocationUpdate(p,{...hint,source:'listing-map'}),null);
 assert.equal(buildLocationUpdate(p,{...hint,address:'51 Chisholm Road, Croydon'}),null);
 assert.equal(buildLocationUpdate({...p,manual_overrides:{latitude:true}},hint),null);
});
test('address editing starts the update and guards concurrent edits',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const compare=readFileSync(new URL('../comparison.js',import.meta.url),'utf8');
 assert.match(compare,/if\(key==='address'\)await onAddressChange/);
 assert.match(html,/if\(addressChanged\)void updateLocationForAddress\(id\)/);
 assert.match(html,/eq\('address',original.address\)/);
 assert.match(html,/\['import_diagnostics','station_commutes','journey_estimates','manual_overrides'\]/);
});
