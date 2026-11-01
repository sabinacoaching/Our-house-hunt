import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualJourney} from '../comparison.js';
test('manual minute correction does not keep incompatible automatic timestamps',()=>{
 const old={minutes:50,departure:'2026-11-03T18:58:00',arrival:'2026-11-03T19:48:00',source:'TfL',calculation_version:'old'};
 const corrected=manualJourney(old,43,'today');
 assert.equal(corrected.minutes,43);
 assert.equal(corrected.manual_override,true);
 assert.equal(corrected.arrival,undefined);
 assert.equal(corrected.departure,undefined);
 assert.deepEqual(corrected.previous_automatic_route,old);
 assert.equal(old.minutes,50);
 const second=manualJourney(corrected,42,'tomorrow');
 assert.deepEqual(second.previous_automatic_route,old);
});
