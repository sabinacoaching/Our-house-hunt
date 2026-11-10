import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatViewingDate,viewingDateInputValue} from '../comparison.js';
process.env.TZ='Europe/London';
test('viewing dates display day, month and minute time without a year or seconds',()=>{
 assert.equal(formatViewingDate('2026-11-15T14:05:37Z'),'15 Nov\n14:05');
});
test('the date editor converts stored UTC to local calendar fields in winter and summer',()=>{
 assert.equal(viewingDateInputValue('2026-11-15T14:05:37Z'),'2026-11-15T14:05');
 assert.equal(viewingDateInputValue('2026-06-15T13:05:37Z'),'2026-06-15T14:05');
 assert.equal(formatViewingDate('2026-06-15T13:05:37Z'),'15 Jun\n14:05');
});
test('missing or invalid viewing dates remain empty and editable',()=>{
 for(const value of [null,'','invalid']){assert.equal(viewingDateInputValue(value),'');assert.equal(formatViewingDate(value),'Set date')}
});
