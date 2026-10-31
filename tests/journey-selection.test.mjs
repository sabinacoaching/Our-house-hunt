import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectJourney} from '../server/house-hunt-journeys/select.js';
const target=Date.parse('2026-11-03T18:40:00Z');
const j=(start,end,duration)=>({startDateTime:'2026-11-03T'+start+':00Z',arrivalDateTime:'2026-11-03T'+end+':00Z',duration,legs:[{mode:{id:'national-rail'}}]});
test('shortest journey within five minutes wins',()=>{
 const trips=[j('17:32','18:37',65),j('17:35','18:35',60),j('17:25','18:20',55)];
 assert.equal(selectJourney(trips,target),trips[1]);
});
test('if window empty, choose latest earlier arrival',()=>{
 const trips=[j('17:30','18:30',60),j('17:25','18:20',55)];
 assert.equal(selectJourney(trips,target),trips[0]);
});
test('rejects late, inconsistent, or walking-only results',()=>{
 const late=j('18:00','18:41',41),bad=j('17:58','18:38',30),walk=j('18:00','18:35',35);
 walk.legs=[{mode:{id:'walking'}}];
 assert.equal(selectJourney([late,bad,walk],target),null);
});
test('real TfL response uses the journey within the arrival window',()=>{
 const trips=[j('17:45','18:28',43),j('17:50','18:34',44),j('17:53','18:36',43)];
 for(const x of trips){x.startDateTime=x.startDateTime.replace('Z','');x.arrivalDateTime=x.arrivalDateTime.replace('Z','')}
 assert.equal(selectJourney(trips,target),trips[2]);
});
