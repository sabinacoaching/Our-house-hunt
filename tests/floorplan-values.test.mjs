import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanText} from '../floorplan-ocr.js';
test('reads the labelled gross internal floor area rather than individual floors or garage',()=>{
 const plan='Woodlands Gardens TW7\nApprox. Gross Internal Floor Area\n99.3 Sq M - 1069 Sq Ft\nGarage Approximate Floor Area 152.14 sq.ft (14.13 sq.m)\nGround Floor Approximate Floor Area 458.47 sq.ft (42.59 sq.m)\nFirst Floor Approximate Floor Area 458.47 sq.ft (42.59 sq.m)';
 assert.equal(parsePlanText(plan).floor_area_sqm,99.3);
});
test('garden dimensions cannot be borrowed from another OCR line',()=>{
 const plan='Garden\nBathroom\n4.6 x 5.0m';
 assert.equal(parsePlanText(plan).garden_area_sqm,undefined);
 assert.equal(parsePlanText('Garden 4.6 x 5.0m').garden_area_sqm,23);
});
test('OCR does not overwrite a concurrent user correction',async()=>{
 const {analyzeFloorplan}=await import('../floorplan-ocr.js');
 const original={window:globalThis.window,fetch:globalThis.fetch,localStorage:globalThis.localStorage};
 globalThis.window={Tesseract:{createWorker:async()=>({recognize:async()=>({data:{text:'Ground floor\nFirst floor\nBedroom\nKitchen'}})})}};
 globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['floorplan'],{type:'image/jpeg'})});
 globalThis.localStorage={getItem:()=>null,setItem(){}};
 const chain={update(){return this},eq(){return this},is(){return this},select:async()=>({data:[],error:null})};
 const p={id:'one',floorplans:[{path:'plan'}],floors:null,manual_overrides:{}};
 try{const result=await analyzeFloorplan({sb:{from:()=>chain},property:p,photo:async()=>'/plan'});assert.equal(result.status,'concurrent-edit');assert.equal(p.floors,null)}
 finally{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
