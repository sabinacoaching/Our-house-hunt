import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileOne,mediaRevision} from '../reconcile-media.js';
function setup({conflict=false,manual=false}={}){
 let row={id:'1',url:'https://example.test/1',images:[{path:'old-photo'}],floorplans:[{path:'old-plan'}],manual_overrides:{},import_diagnostics:manual?{manual_floorplan_saved_at:'today'}:{}};
 const sb={from(){let patch=null;return {select(){return patch?Promise.resolve(conflict?{data:[],error:null}:(row={...row,...patch},{data:[{id:'1'}],error:null})):this},eq(){return this},single:async()=>({data:structuredClone(row),error:null}),update(p){patch=p;return this}}}};
 const read=async()=>({images:['a','b'],floorplans:['plan']});
 const archive=async(urls,id,prefix)=>urls.map((x,i)=>({path:prefix+'/'+i}));
 return {sb,read,archive,property:{id:'1'},row:()=>row};
}
test('one-time migration updates original media only and marks completion',async()=>{
 const x=setup(),r=await reconcileOne(x);assert.equal(r.status,'saved');assert.deepEqual(x.row().images,[{path:'photo/0'},{path:'photo/1'}]);assert.deepEqual(x.row().floorplans,[{path:'source-plan/0'}]);assert.equal(x.row().import_diagnostics.media_source_revision,mediaRevision);
});
test('manual floorplan survives migration',async()=>{
 const x=setup({manual:true});await reconcileOne(x);assert.deepEqual(x.row().floorplans,[{path:'old-plan'}]);
});
test('concurrent edits abort media replacement',async()=>{
 const x=setup({conflict:true}),r=await reconcileOne(x);assert.equal(r.status,'changed-during-repair');assert.deepEqual(x.row().images,[{path:'old-photo'}]);
});
test('unavailable original does not replace old photographs',async()=>{
 const x=setup();x.read=async()=>{throw Error('The original listing is unavailable or redirected to another page')};const r=await reconcileOne(x);assert.equal(r.status,'listing-unavailable');assert.deepEqual(x.row().images,[{path:'old-photo'}]);
});
