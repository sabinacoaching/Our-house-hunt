import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareAgencies,viewingStatuses,viewingStatusKey,statusEditorOptions} from '../comparison.js';

test('agency sorting groups case and whitespace variants and puts missing agencies last in either direction',()=>{
 const rows=[{id:'missing',agency_name:null},{id:'oakhill',agency_name:'Oakhill'},{id:'foxtons-1',agency_name:'  Foxtons   Twickenham '},{id:'chase',agency_name:'Chase Buchanan'},{id:'foxtons-2',agency_name:'foxtons twickenham'},{id:'blank',agency_name:'   '}];
 assert.deepEqual([...rows].sort(compareAgencies).map(p=>p.id),['chase','foxtons-1','foxtons-2','oakhill','missing','blank']);
 assert.deepEqual([...rows].sort((a,b)=>compareAgencies(a,b,true)).map(p=>p.id),['oakhill','foxtons-1','foxtons-2','chase','missing','blank']);
});

test('viewing enquiry and request are distinct, and retired status choices are absent from filters',()=>{
 assert.equal(viewingStatuses.enquire_viewing,'Enquire a viewing');
 assert.equal(viewingStatuses.requested_viewing,'Requested viewing');
 assert.equal(viewingStatuses.under_offer,'Under offer');
 for(const key of ['shortlisted','sold','under_offer_sold','rejected'])assert.equal(Object.hasOwn(viewingStatuses,key),false);
});

test('editing a house retains its saved legacy status and Under offer filtering includes the earlier combined value',()=>{
 assert.equal(viewingStatusKey('under_offer_sold'),'under_offer');
 assert.equal(viewingStatusKey('enquire_viewing'),'enquire_viewing');
 const legacy=statusEditorOptions('under_offer_sold');
 assert.equal(legacy.filter(([key])=>key==='under_offer_sold').length,1);
 assert.equal(legacy.find(([key])=>key==='under_offer_sold')[1],'Under offer');
 assert.ok(statusEditorOptions('shortlisted').some(([key])=>key==='shortlisted'));
 assert.ok(!statusEditorOptions('interested').some(([key])=>key==='shortlisted'));
});
