import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setStatusChecks,isActiveStatus} from '../comparison.js';
test('status controls select all, clear all, and restore active statuses',()=>{
 const checks=new Map(['','interested','viewed','only_wo','under_offer','archived','deleted'].map(key=>[key,{checked:false}]));
 setStatusChecks(checks,'all'); assert.ok([...checks.values()].every(x=>x.checked));
 setStatusChecks(checks,'none'); assert.ok([...checks.values()].every(x=>!x.checked));
 checks.get('viewed').checked=true; assert.deepEqual([...checks].filter(([,x])=>x.checked).map(([k])=>k),['viewed']);
 setStatusChecks(checks,'active'); assert.deepEqual([...checks].filter(([,x])=>x.checked).map(([k])=>k),['','interested','viewed']);
});

test('under offer, legacy under offer and only w/o are not active but remain selectable',()=>{
 for(const status of ['under_offer','under_offer_sold','only_wo','archived','deleted'])assert.equal(isActiveStatus(status),false);
 for(const status of ['','interested','viewed','shortlisted'])assert.equal(isActiveStatus(status),true);
 const checks=new Map(['under_offer','only_wo'].map(key=>[key,{checked:false}]));setStatusChecks(checks,'all');assert.ok([...checks.values()].every(x=>x.checked));
});
