import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../extension/google-route-parser.js';
const {readTransit,readWalk}=globalThis.HouseHuntGoogleRoutes;
const rows=[{duration:'38 min',heading:'7:09 PM (Tuesday)—7:47 PM',modes:['Walk','Train','Bus']},{duration:'37 min',heading:'7:03 PM (Tuesday)—7:40 PM',modes:['Train','Bus']},{duration:'43 min',heading:'7:04 PM (Tuesday)—7:47 PM',modes:['Train','Bus']}];
test('Google candidates use the five-minute window before shortest duration',()=>{assert.deepEqual(readTransit(rows,19*60+50),{departure:19*60+9,arrival:19*60+47,minutes:38,heading:rows[0].heading})});
test('reject late, inconsistent and walking-only candidates',()=>{assert.equal(readTransit([{duration:'12 min',heading:'7:39 PM—7:51 PM',modes:['Bus']},{duration:'50 min',heading:'7:00 PM—7:48 PM',modes:['Bus']},{duration:'12 min',heading:'7:36 PM—7:48 PM',modes:['Walk']}],1190),null)});
 test('when there is no five-minute candidate, choose the latest earlier arrival',()=>{const r=readTransit([{duration:'30 min',heading:'7:00 PM—7:30 PM',modes:['Bus']},{duration:'35 min',heading:'7:05 PM—7:40 PM',modes:['Train']}],1190);assert.equal(r.arrival,1180)});
 test('convert Google walking distance units without inventing numbers',()=>{assert.deepEqual(readWalk([{duration:'8 min',distance:'0.4 mile'}]),{walking_minutes:8,walking_miles:.4,display_distance:'0.4 mile'});assert.equal(readWalk([{duration:'6 min',distance:'500 m'}]).walking_miles,.311);assert.equal(readWalk([{duration:'8 min',distance:'unknown'}]),null)});
