import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../extension/google-route-parser.js';
import {selectGoogleStations} from '../google-station-selection.js';
const {readTransit}=globalThis.HouseHuntGoogleRoutes;
test('Lyncroft: 06:37-07:31 beats the slower 06:31-07:38 before the five-minute window is considered',()=>{
 const r=readTransit([{duration:'67 min',heading:'6:31 AM-7:38 AM',modes:['Train']},{duration:'54 min',heading:'6:37 AM-7:31 AM',modes:['Train']}],460);
 assert.equal(r.minutes,54);assert.equal(r.departure,397);assert.equal(r.arrival,451);
});
test('a newly found 41-minute journey inside the arrival window replaces the dominated 53-minute option',()=>{
 const r=readTransit([{duration:'53 min',heading:'6:46 AM-7:39 AM',modes:['Train']},{duration:'41 min',heading:'6:42 AM-7:23 AM',modes:['Train']},{duration:'41 min',heading:'6:57 AM-7:38 AM',modes:['Train']}],460);
 assert.equal(r.minutes,41);assert.equal(r.departure,417);assert.equal(r.arrival,458);
});
function stations(tubeMinutes=30){
 const origin={lat:51.3694953,lon:-.0883864},originKey=origin.lat+','+origin.lon;
 const values=[['Lebanon Road Tram Stop','940GZZCRLEB',1],['East Croydon','910GECROYDN',13],['South Croydon','910GSCROYDN',14],['West Croydon','910GWCROYDN',25],['Example Underground','940GZZLUTEST',tubeMinutes]];
 const metadata={origin:originKey,protected_names:[null,null,null],candidates:values.map(([name,station_id],i)=>({name,station_id,named_query:true,entrances:[{entrance_id:station_id+'-entry',lat:origin.lat+(i+1)*.001,lon:origin.lon}]}))};
 const calls=[],route=async(destination,name)=>{calls.push(destination);const minutes=values.find(x=>x[0]===name)[2];return {source:'Google Maps',station_id:destination.station_id,origin:originKey,destination:destination.query,walking_minutes:minutes,walking_miles:minutes/25}};
 return {metadata,calls,options:{origin,route}};
}
test('nearby trams cannot displace the nearest three rail and Tube stations',async()=>{
 const x=stations(),r=await selectGoogleStations(x.metadata,x.options);
 assert.deepEqual(r.preview.tfl_final.names,['East Croydon','South Croydon','West Croydon']);
 assert.ok(x.calls.every(x=>!x.query.includes('Tram Stop')));
 assert.ok(x.calls.every(x=>x.query&&x.station_id));
});
test('a Tube station enters the set when its real walking route is closer than the rail alternatives',async()=>{
 const x=stations(12),r=await selectGoogleStations(x.metadata,x.options);
 assert.deepEqual(r.preview.tfl_final.names,['Example Underground','East Croydon','South Croydon']);
});
