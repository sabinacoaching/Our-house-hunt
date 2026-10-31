import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalListing,importChanges,validateGeocode} from '../import-utils.js';
test('listing identity ignores tracking and hostname aliases',()=>{
 assert.equal(canonicalListing('https://zoopla.co.uk/for-sale/details/123/?foo=bar'),'https://www.zoopla.co.uk/for-sale/details/123');
 assert.equal(canonicalListing('https://rightmove.co.uk/properties/456?x=y'),'https://www.rightmove.co.uk/properties/456');
});
test('repeat import refreshes source values but protects user values and fills gaps',()=>{
 const p={price:499000,bedrooms:2,floors:null,garden_area_sqm:25,manual_overrides:{garden_area_sqm:true},import_diagnostics:{source_values:{price:499000,bedrooms:3,garden_area_sqm:25}}};
 assert.deepEqual(importChanges(p,{price:510000,bedrooms:4,floors:2,garden_area_sqm:100}),{price:510000,floors:2});
});
test('geocoding rejects a different house or street and missing number',()=>{
 const candidate=(house_number,road)=>({address:{house_number,road}});
 assert.equal(validateGeocode('110 Dunston Road, Battersea',candidate('44','Dunston Road')),false);
 assert.equal(validateGeocode('110 Dunston Road, Battersea',candidate('110','Dunston Avenue')),false);
 assert.equal(validateGeocode('Dunston Road, Battersea',candidate('110','Dunston Road')),false);
 assert.equal(validateGeocode('110 Dunston Road, Battersea',candidate('110','Dunston Rd')),true);
});
