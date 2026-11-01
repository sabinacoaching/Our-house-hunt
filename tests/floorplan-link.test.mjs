import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openFloorPlan} from '../comparison.js';

test('each floor plan click resolves the current signed link',async()=>{
 let now=0, issued=0, cached, expires=0;const opened=[];
 const photo=async()=>{if(!cached||now>=expires){cached='signed-'+(++issued);expires=now+50}return cached};
 const win={open(){const tab={opener:{},location:{replace(url){opened.push(url)}},close(){}};return tab}};
 await openFloorPlan({path:'plan.jpg'},photo,win);now=61;
 await openFloorPlan({path:'plan.jpg'},photo,win);
 assert.deepEqual(opened,['signed-1','signed-2']);
});
test('blocked popup falls back to opening the plan in the current tab',async()=>{
 let opened;const win={open:()=>null,location:{assign:url=>{opened=url}}};
 await openFloorPlan({path:'plan.jpg'},async()=>'current-signed-url',win);
 assert.equal(opened,'current-signed-url');
});
test('failed plan access closes the blank tab',async()=>{
 let closed=false;const win={open:()=>({close(){closed=true}})};
 await assert.rejects(openFloorPlan({},async()=>'',win),/could not be opened/);
 assert.equal(closed,true);
});
