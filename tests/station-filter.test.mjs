import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stationOptions,stationDistance,nearestSelectedWalkingMinutes,nearestSelectedWalkingStation,matchesJourneyTimes,matchesStation} from '../comparison.js';

const homes=[
 {id:'a',station_name:'Isleworth',station_distance_miles:.4,station_2_name:'Syon Lane',station_2_distance_miles:1.1},
 {id:'b',station_name:'  syon   lane ',station_distance_miles:.7,station_2_name:'Isleworth',station_2_distance_miles:.8,station_3_name:'Hounslow East',station_3_distance_miles:1.4},
 {id:'c',station_name:'Whitton',station_distance_miles:.3,station_2_name:'Isleworth',station_2_distance_miles:null},
 {id:'d',station_name:'',station_distance_miles:null}
];
test('station choices combine all three station fields and merge case and whitespace variants',()=>{
 assert.deepEqual(stationOptions(homes),[['hounslow east','Hounslow East'],['isleworth','Isleworth'],['syon lane','Syon Lane'],['whitton','Whitton']]);
});
test('station filter matches any displayed station and combines selections',()=>{
 assert.deepEqual(homes.filter(p=>matchesStation(p,new Set(['isleworth']))).map(p=>p.id),['a','b','c']);
 assert.deepEqual(homes.filter(p=>matchesStation(p,new Set(['whitton','hounslow east']))).map(p=>p.id),['b','c']);
 assert.equal(homes.filter(p=>matchesStation(p,null)).length,4);
});
test('distance sorting uses the selected station, handles missing distances and falls back to the nearest when unfiltered',()=>{
 const selected=new Set(['isleworth']);
 assert.deepEqual(homes.map(p=>stationDistance(p,selected)),[.4,.8,null,null]);
 assert.equal(stationDistance(homes[2],null),.3);
 assert.equal(stationDistance(homes[1],new Set(['isleworth','syon lane'])),.7);
});
test('distance sorting matches the walking route shown and respects manual correction',()=>{
 const p={address:'101 Cedar Road',latitude:51.377,longitude:-.087,station_name:'East Croydon',station_distance_miles:.23,station_commutes:{tfl_final:{complete:true,origin:'51.377,-0.087',names:['East Croydon'],results:[{name:'East Croydon',walking_miles:.4}]}}};
 assert.equal(stationDistance(p),.4);
 p.station_commutes.google_verified={'East Croydon':{walking_miles:.5}};
 assert.equal(stationDistance(p),.5);
});
test('both status selectors and the table support the new statuses without offering rejected',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const comparison=readFileSync(new URL('../comparison.js',import.meta.url),'utf8');
 assert.equal((html.match(/<option value="requested_viewing">Requested viewing<\/option>/g)||[]).length,2);
 assert.equal((html.match(/<option value="only_wo">Only w\/o<\/option>/g)||[]).length,2);
 assert.doesNotMatch(html,/<option value="rejected">/);
 assert.match(comparison,/requested_viewing:'Requested viewing'/);
 assert.match(comparison,/only_wo:'Only w\/o'/);
 assert.match(html,/matchesStation\(p,stationSelection\)/);
 assert.match(html,/nearestSelectedWalkingMinutes\(p,stationSelection\)/);
});

test('walking time sort uses the quickest selected station and ignores missing times',()=>{
 const p={station_name:'Alpha',station_2_name:'Beta',station_3_name:'Gamma',station_commutes:{results:[{name:'Alpha',walking_minutes:12},{name:'Beta',walking_minutes:5},{name:'Gamma',walking_minutes:2}]}};
 assert.equal(nearestSelectedWalkingMinutes(p,new Set(['alpha','beta'])),5);
 assert.equal(nearestSelectedWalkingMinutes(p,new Set(['alpha'])),12);
 assert.equal(nearestSelectedWalkingMinutes(p,null),2);
 assert.equal(nearestSelectedWalkingMinutes(p,new Set(['other'])),null);
 p.station_commutes.google_verified={Beta:{walking_minutes:17}};
 assert.equal(nearestSelectedWalkingMinutes(p,new Set(['alpha','beta'])),12);
 delete p.station_commutes.results[0].walking_minutes;
 assert.equal(nearestSelectedWalkingMinutes(p,new Set(['alpha'])),null);
});

test('walking sort uses selected stations and reports the matching station',()=>{
 const p={station_name:'Hounslow',station_2_name:'Norbury',station_commutes:{results:[{name:'Hounslow',walking_minutes:13},{name:'Norbury',walking_minutes:10}]}};
 assert.deepEqual(nearestSelectedWalkingStation(p,new Set(['hounslow','norbury'])),{name:'Norbury',minutes:10});
 assert.deepEqual(nearestSelectedWalkingStation(p,new Set(['hounslow'])),{name:'Hounslow',minutes:13});
});
test('journey filters combine each destination, exclude missing values and respect the maximum',()=>{
 const p={journey_estimates:{dancelab:{minutes:40},dilly:{minutes:60},waterloo:{minutes:35}}};
 assert.equal(matchesJourneyTimes(p,{dancelab:40,waterloo:35}),true);assert.equal(matchesJourneyTimes(p,{dancelab:39}),false);assert.equal(matchesJourneyTimes(p,{dilly:59}),false);assert.equal(matchesJourneyTimes({}, {waterloo:40}),false);assert.equal(matchesJourneyTimes({},{}),true);
});
