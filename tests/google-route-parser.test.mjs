import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../extension/google-route-parser.js';
const {readTransit,readWalk}=globalThis.HouseHuntGoogleRoutes;
const rows=[{duration:'38 min',heading:'7:09 PM (Tuesday)—7:47 PM',modes:['Walk','Train','Bus']},{duration:'37 min',heading:'7:03 PM (Tuesday)—7:40 PM',modes:['Train','Bus']},{duration:'43 min',heading:'7:04 PM (Tuesday)—7:47 PM',modes:['Train','Bus']}];
test('Google candidates use the five-minute window before shortest duration',()=>{assert.deepEqual(readTransit(rows,19*60+50),{departure:19*60+9,arrival:19*60+47,minutes:38,heading:rows[0].heading})});
test('reject late, inconsistent and walking-only candidates',()=>{assert.equal(readTransit([{duration:'12 min',heading:'7:39 PM—7:51 PM',modes:['Bus']},{duration:'50 min',heading:'7:00 PM—7:48 PM',modes:['Bus']},{duration:'12 min',heading:'7:36 PM—7:48 PM',modes:['Walk']}],1190),null)});
 test('when there is no five-minute candidate, choose the latest earlier arrival',()=>{const r=readTransit([{duration:'30 min',heading:'7:00 PM—7:30 PM',modes:['Bus']},{duration:'35 min',heading:'7:05 PM—7:40 PM',modes:['Train']}],1190);assert.equal(r.arrival,1180)});
 test('convert Google walking distance units without inventing numbers',()=>{assert.deepEqual(readWalk([{duration:'8 min',distance:'0.4 mile'}]),{walking_minutes:8,walking_miles:.4,display_distance:'0.4 mile'});assert.equal(readWalk([{duration:'6 min',distance:'500 m'}]).walking_miles,.311);assert.equal(readWalk([{duration:'8 min',distance:'unknown'}]),null)});

test('walk detail text reads actual legs instead of the total walking time',()=>{
 const {readWalkingLegs}=globalThis.HouseHuntGoogleRoutes;
 assert.deepEqual(readWalkingLegs('6:47 PM\nWalk\n\nAbout 23 min, 1.1 mi\nMitcham Junction\nTram\nWalk\n\nAbout 4 min\nWimbledon'),[23,4]);
});
test('rejects long station walks, selects latest departure and compares three verified options',()=>{
 const {rankDetailedTransit}=globalThis.HouseHuntGoogleRoutes;
 const rows=[
  {duration:'58 min',heading:'6:47 PM - 7:45 PM',modes:['Walk','Tram','Subway'],walking_legs:[23,4,4],access_walking_legs:[23,4]},
  {duration:'63 min',heading:'6:43 PM - 7:46 PM',modes:['Walk','Bus'],walking_legs:[15,9],access_walking_legs:[15]},
  {duration:'50 min',heading:'6:43 PM - 7:33 PM',modes:['Walk','Train','Bus'],walking_legs:[11,2,1],access_walking_legs:[11,2]},
  {duration:'51 min',heading:'6:44 PM - 7:35 PM',modes:['Walk','Train','Bus'],walking_legs:[10,3],access_walking_legs:[10]},
  {duration:'52 min',heading:'6:46 PM - 7:38 PM',modes:['Walk','Train','Bus'],walking_legs:[12,2],access_walking_legs:[12]},
  {duration:'45 min',heading:'7:12 PM - 7:57 PM',modes:['Walk','Train','Bus'],walking_legs:[10],access_walking_legs:[10]}
 ].map(row=>({...row,details_verified:true}));
 const r=rankDetailedTransit(rows,1190);assert.equal(r.selected.minutes,52);assert.deepEqual(r.top_three.map(x=>x.minutes),[52,51,50]);
 const pair=rankDetailedTransit(rows.filter(x=>[50,63].includes(x.duration.split(' ')[0]*1)),1190);assert.equal(pair.selected.minutes,50);
});
test('two or more changes are a reserve; missing or over-limit transfer walks are rejected',()=>{
 const {rankDetailedTransit}=globalThis.HouseHuntGoogleRoutes;
 const base={duration:'40 min',heading:'7:05 PM - 7:45 PM',walking_legs:[10,20],details_verified:true};
 const bad={...base,modes:['Bus','Train'],access_walking_legs:[10,18]};
 const many={...base,modes:['Train','Bus','Train'],access_walking_legs:[10]};
 const simple={...base,duration:'41 min',heading:'7:04 PM - 7:45 PM',modes:['Train','Bus'],access_walking_legs:[10]};
 assert.equal(rankDetailedTransit([bad,{...many,details_verified:false}],1190).selected,null);
 assert.equal(rankDetailedTransit([many,simple],1190).selected.minutes,41);
 assert.equal(rankDetailedTransit([many],1190).selected.transfers,2);
});
