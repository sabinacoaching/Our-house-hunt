import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setStatusChecks} from '../comparison.js';
test('status controls select all, clear all, and restore active statuses',()=>{
 const checks=new Map(['','interested','viewed','archived','deleted'].map(key=>[key,{checked:false}]));
 setStatusChecks(checks,'all'); assert.ok([...checks.values()].every(x=>x.checked));
 setStatusChecks(checks,'none'); assert.ok([...checks.values()].every(x=>!x.checked));
 checks.get('viewed').checked=true; assert.deepEqual([...checks].filter(([,x])=>x.checked).map(([k])=>k),['viewed']);
 setStatusChecks(checks,'active'); assert.deepEqual([...checks].filter(([,x])=>x.checked).map(([k])=>k),['','interested','viewed']);
});
