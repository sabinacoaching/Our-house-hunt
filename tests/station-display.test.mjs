import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupStationAccess} from '../station-commutes.js';
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
