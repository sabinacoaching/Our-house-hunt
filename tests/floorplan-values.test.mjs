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
 const chain={eq(){return this},select(){return this},single:async()=>({data:structuredClone(p),error:null})};
 const p={id:'one',floorplans:[{path:'plan'}],floors:null,manual_overrides:{}};
 try{const result=await analyzeFloorplan({sb:{from:()=>chain,rpc:async()=>({data:false,error:null})},property:p,photo:async()=>'/plan'});assert.equal(result.status,'concurrent-edit');assert.equal(p.floors,null)}
 finally{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
test('printed metric Gross Internal Area wins over converted feet and a total including the garage',()=>{
 assert.equal(parsePlanText('Approximate Gross Internal Area = 92.66 sq m/ 997 sq ft\nGarage = 11.84 sq m/128 sq ft\nTotal = 104.5 sq m/1125 sq ft').floor_area_sqm,92.66);
 assert.equal(parsePlanText('Total Approximate Gross Internal Area = 89.77 sq m/ 966 sq ft').floor_area_sqm,89.77);
 assert.equal(parsePlanText('GROSS INTERNAL AREA\nAPPROX TOTAL: 81.sq.m - 871.sq.ft').floor_area_sqm,81);
 assert.equal(parsePlanText('Approximate Area: 45 sqm\nGross Internal Area 96 sqm').floor_area_sqm,96);
 assert.equal(parsePlanText('APPROX. GROSS INTERNAL FLOOR AREA WITH GARAGE: 1597 SQFT/148 SQM\nAPPROX. GROSS INTERNAL FLOOR AREA WITHOUT GARAGE: 1297 SQFT/120 SQM').floor_area_sqm,120);
});

test('Hatch Road accepts a damaged square-metre superscript only when the printed feet total agrees',()=>{
 assert.equal(parsePlanText('Kitchen\nBedroom\nTotal floor area 92.8 m? (998 sq.ft.) approx').floor_area_sqm,92.8);
 assert.notEqual(parsePlanText('Total floor area 92.8 m? (700 sq.ft.) approx').floor_area_sqm,92.8);
});
test('Station Road footer total is not rejected because it follows the storey labels',()=>{
 const text='Ground Floor First Floor Second Floor\nTotal area (approx.): 117.1 sq. m (1260.4 sq. ft)\nOutbuilding area (approx.): 6.3 sq. m (67.8 sq. ft)';
 assert.equal(parsePlanText(text).floor_area_sqm,117.1);
});
test('Acacia Road uses the overall GIA rather than the preceding storey subtotal',()=>{
 const floors='GROUND FLOOR\n560SQFT/52.0SQM\nFIRST FLOOR\n486SQFT/452SQM\nAPPROXIMATE GROSS INTERNAL AREA';
 assert.equal(parsePlanText(floors+'\n1046 SQ FT/97.2SQM').floor_area_sqm,97.2);
 assert.equal(parsePlanText(floors).floor_area_sqm,undefined);
});
