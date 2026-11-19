import {test} from 'node:test';
import assert from 'node:assert/strict';
import {additionalPlanArea,matchesFloorArea,formatPinnedPrice} from '../comparison.js';
const house=(a,b)=>({floor_area_sqm:a,import_diagnostics:{source_values:{floor_area_sqm:a},floorplan_measurements:{labelled_values:{floor_area_sqm:b}}}});
test('shows plan total beside advertised total when the difference is meaningful in square feet',()=>{
 assert.equal(additionalPlanArea(house(104.98,120)),120);
 assert.equal(additionalPlanArea(house(91.04,96)),96);
 assert.equal(additionalPlanArea(house(95.88,95.91)),null);
 assert.equal(additionalPlanArea(house(83.98,83)),null);
 assert.equal(additionalPlanArea(house(83.98,82.9)),82.9);
 assert.equal(additionalPlanArea(house(null,96)),null);
 assert.equal(additionalPlanArea({...house(91.04,96),manual_overrides:{floor_area_sqm:true}}),null);
});
test('compares printed square feet rather than rounding the metric value from the plan',()=>{
 const p=house(120.49,120);p.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqft=1297;
 assert.equal(additionalPlanArea(p),null);
});

test('floor area filters use the first stored measurement, not the floor plan',()=>{
 const p=house(80,120);assert.equal(matchesFloorArea(p,{min:85,max:null}),false);assert.equal(matchesFloorArea(p,{min:80,max:80}),true);
 assert.equal(matchesFloorArea({floor_area_sqm:null},{min:1,max:null}),false);assert.equal(matchesFloorArea({},null),true);
});
test('fixed price is formatted as pounds',()=>{assert.equal(formatPinnedPrice(475000),'£475,000');assert.equal(formatPinnedPrice(null),'Price unavailable')});
