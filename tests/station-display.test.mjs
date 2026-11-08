import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupStationAccess,stationWalkingMapUrl} from '../station-commutes.js';
const element=()=>({children:[],classList:{add(){}},setAttribute(){},append(...xs){this.children.push(...xs)}});
test('station display uses a confirmed address route without inventing walking minutes',()=>{
 const previous=globalThis.document;globalThis.document={createElement:element};
 try{
  const p={id:'1',address:'37 Longford Road',latitude:51.4,longitude:-.3,station_name:'Whitton',station_2_name:'',station_3_name:'',station_commutes:{
   tfl_final:{complete:true,origin:'51.445,-0.367',origin_input:'37 Longford Road',names:['Whitton','',''],results:[{name:'Whitton',walking_miles:.73,walking_minutes:16,pt_minutes:8,pt_departure:'2026-11-03T07:32:00'}]}
  }};
  const box=setupStationAccess({sb:{},history:{},shouldAutoCalculate:()=>false}).attach(p,0);
  assert.equal(box.children[0].textContent,'Walking: 0.73 mi / 16 min');
  assert.equal(box.children[2].textContent,'PT: 8 min');
  p.station_commutes.tfl_final.results[0].walking_minutes=null;
  const second=setupStationAccess({sb:{},history:{},shouldAutoCalculate:()=>false}).attach(p,0);
  assert.equal(second.children[0].textContent,'Walking: 0.73 mi');
 }finally{globalThis.document=previous}
});
test('walking link uses the same Street View origin and distinct confirmed station points as the saved route',()=>{
 const p={url:'https://example.test/listing',address:'101 Cedar Road',latitude:51.3770119,longitude:-.0867585,station_name:'East Croydon Tram Stop',station_2_name:'East Croydon',import_diagnostics:{source_location:{source:'listing-street-view',listing_url:'https://example.test/listing',address_input:'101 Cedar Road',latitude:51.3770119,longitude:-.0867585}},station_commutes:{tfl_final:{origin:'51.3770119,-0.0867585',results:[{name:'East Croydon Tram Stop',station_id:'940GZZCRECR',entrance_id:'tram-entrance',lat:51.3759,lon:-.0919},{name:'East Croydon',station_id:'910GECROYDN',entrance_id:'rail-entrance',lat:51.37545,lon:-.09278}]}}};
 const first=new URL(stationWalkingMapUrl(p,0)),second=new URL(stationWalkingMapUrl(p,1));
 assert.equal(first.searchParams.get('origin'),'51.3770119,-0.0867585');assert.equal(first.searchParams.get('destination'),'51.3759,-0.0919');assert.equal(second.searchParams.get('destination'),'51.37545,-0.09278');
});
test('does not present a transport hub centroid as the station point',()=>{
 const p={address:'101 Cedar Road',latitude:51.377,longitude:-.086,station_name:'East Croydon',station_commutes:{tfl_final:{origin:'51.377,-0.086',results:[{name:'East Croydon',station_id:'HUBECY',lat:51.375995,lon:-.091172}]}}};
 assert.equal(new URL(stationWalkingMapUrl(p,0)).searchParams.get('destination'),'East Croydon Railway Station, London, UK');
});
