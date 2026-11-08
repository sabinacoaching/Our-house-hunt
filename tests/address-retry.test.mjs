import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const resumeCode=html.slice(html.indexOf('async function resumePendingRoutes('),html.indexOf('async function show()'));
function setup(homes){
 const calls=[],pending=new Set();
 const resume=new Function('homes','user','pendingJourneyImportIds','finishNewHouseImport',resumeCode+';return resumePendingRoutes')(homes,{id:'member'},pending,async id=>calls.push(id));
 return {resume,calls,pending};
}
test('refresh resumes a numbered address on an incomplete new import',async()=>{
 const x=setup([{id:'new',address:'88 Sussex Avenue, Isleworth',import_diagnostics:{route_pending:true}}]);
 assert.equal(await x.resume(),1);assert.deepEqual(x.calls,['new']);assert.ok(x.pending.has('new'));
});
test('completed, deleted and unnumbered homes are never retried',async()=>{
 const x=setup([{id:'done',address:'1 High Road',import_diagnostics:{route_pending:false}},{id:'old',address:'2 High Road'},{id:'deleted',status:'deleted',address:'3 High Road',import_diagnostics:{route_pending:true}},{id:'no-address',address:'High Road',import_diagnostics:{route_pending:true}}]);
 assert.equal(await x.resume(),0);assert.deepEqual(x.calls,[]);
});
test('saving one address does not recalculate another unfinished house',async()=>{
 const x=setup(['one','two'].map(id=>({id,address:'88 Sussex Avenue, Isleworth',import_diagnostics:{route_pending:true}})));
 await x.resume('one');assert.deepEqual(x.calls,['one']);
});
test('refresh and save connect to pending import retry',()=>{
 assert.match(html,/\$\('refresh'\)\.onclick=[^\n]+await resumePendingRoutes\(\)/);
 assert.match(html,/\$\('save'\)\.onclick=[^\n]+if\(addressChanged\)void updateLocationForAddress\(id\)/);
 assert.match(html,/importsRequestedAgain\.delete\(id\)/);
 assert.match(html,/Address or location changed during station lookup/);
});
