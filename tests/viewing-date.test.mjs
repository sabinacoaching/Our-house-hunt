import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatViewingDate,viewingDateParts,parseViewingDateFields} from '../viewing-date.js';
process.env.TZ='America/New_York';
const now=new Date('2026-11-10T10:00:00Z'),fields={day:'12',month:'12',hours:'12',minutes:'02'};
const parse=(values,options={})=>parseViewingDateFields(values,{now,...options});
test('12 December 12:02 becomes the valid full timestamp without requiring year or seconds',()=>{
 assert.deepEqual(parse(fields),{value:'2026-12-12T12:02:00.000Z',error:null});
 assert.equal(formatViewingDate(parse(fields).value),'12 Dec\n12:02');
});
test('empty fields clear a date, while partial input returns a readable error without a timestamp',()=>{
 assert.deepEqual(parse({}),{value:null,error:null});
 const partial=parse({...fields,minutes:''});assert.match(partial.error,/Enter day, month, hours and minutes/);assert.equal(partial.value,undefined);
});
test('invalid calendar days and time fields never reach ISO conversion',()=>{
 for(const value of [{...fields,day:'31',month:'4'},{...fields,day:'29',month:'2'},{...fields,hours:'24'},{...fields,minutes:'60'},{...fields,day:'x'}]){
  const result=parse(value);assert.ok(result.error);assert.equal(result.value,undefined);
 }
});
test('unchanged fields retain the exact saved timestamp, including seconds and saved year',()=>{
 const original='2027-12-12T12:02:37+00:00';
 assert.deepEqual(parse(fields,{original}),{value:original,error:null});
 const changed=parse({...fields,hours:'13'},{original});assert.equal(changed.value,'2027-12-12T13:02:00.000Z');
});
test('a new January date rolls forward while December stays in the current year',()=>{
 assert.equal(parse({...fields,month:'1'}).value,'2027-01-12T12:02:00.000Z');
 assert.equal(parse(fields).value,'2026-12-12T12:02:00.000Z');
});
test('London summer time is correct even when the device uses New York time',()=>{
 const summer=parse({day:'15',month:'6',hours:'14',minutes:'05'},{now:new Date('2026-05-01T10:00:00Z')});
 assert.equal(summer.value,'2026-06-15T13:05:00.000Z');
 assert.deepEqual(viewingDateParts(summer.value),{year:2026,month:'6',day:'15',hours:'14',minutes:'05'});
 assert.equal(formatViewingDate(summer.value),'15 Jun\n14:05');
});
test('a missing London daylight-saving clock time has a readable validation error',()=>{
 const result=parse({day:'28',month:'3',hours:'01',minutes:'30'});
 assert.match(result.error,/does not exist in London/);assert.equal(result.value,undefined);
});

test('a clicked calendar date keeps its explicit year, including earlier dates',()=>{
 assert.equal(parse({year:2026,day:'12',month:'10',hours:'12',minutes:'00'}).value,'2026-10-12T11:00:00.000Z');
});
test('calendar navigation can select the same month/day in a different year',()=>{
 const original='2026-12-12T12:02:37Z';
 assert.equal(parse({...fields,year:2027},{original}).value,'2027-12-12T12:02:00.000Z');
});
