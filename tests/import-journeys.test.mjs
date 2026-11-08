import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('async function calculateImportRoutes('),html.indexOf('// Resume only imports'));
function setup(complete=true){
 const p={id:'house',address:'37 Longford Road, Twickenham',latitude:null,longitude:null};
 const pending=new Set([p.id]),calls=[];
 let diagnostics={source_values:{price:500000},route_pending:true},stationsFound=false;
 const sb={
  functions:{invoke:async(name)=>{
   calls.push(name);
   if(name==='house-hunt-journeys')return {data:{journeys:{waterloo:{origin:'51.4457,-0.3676',origin_input:p.address,calculation_version:'arrival-window-v4'}}}};
   return {data:{commutes:{tfl_final:{complete}}}};
  }},
  from(){let patch=null;const chain={
   update(x){patch=x;return this},eq(){return this},is(){return this},
   select(){return this},single:async()=>({data:{import_diagnostics:diagnostics}}),
   maybeSingle:async()=>({data:{id:p.id}}),
   then(resolve){if(patch?.import_diagnostics)diagnostics=patch.import_diagnostics;resolve({data:[{id:p.id}]})}
  };return chain}
 };
 const enrich=async()=>{stationsFound=true;p.station_name='Isleworth'};
 const calculate=new Function('pendingJourneyImportIds','sb','enrichWalkingStations',code+';return calculateImportRoutes')(pending,sb,enrich);
 return {p,pending,calls,calculate,diagnostics:()=>diagnostics,stationsFound:()=>stationsFound};
}
test('new import derives a confirmed point, saves station routes and marks completion',async()=>{
 const x=setup();assert.deepEqual(await x.calculate(x.p),[]);
 assert.deepEqual(x.calls,['house-hunt-journeys','house-hunt-station-commutes']);
 assert.equal(x.stationsFound(),true);assert.equal(x.p.latitude,51.4457);
 assert.equal(x.pending.has(x.p.id),false);assert.equal(x.diagnostics().route_pending,false);
 assert.equal(x.diagnostics().source_values.price,500000);
});
test('incomplete station routes remain pending for a later retry',async()=>{
 const x=setup(false);assert.ok((await x.calculate(x.p)).includes('station times'));
 assert.equal(x.pending.has(x.p.id),true);assert.equal(x.diagnostics().route_pending,true);
});
test('does not ask for station journeys when no station has been found',async()=>{
 const x=setup();x.p.latitude=51.4;x.p.longitude=-0.2;
 assert.ok((await x.calculate(x.p)).includes('stations'));
 assert.deepEqual(x.calls,['house-hunt-journeys']);assert.equal(x.pending.has(x.p.id),true);
});
test('new imports requiring Street View never route from an unverified address',async()=>{
 const x=setup();x.p.import_diagnostics={require_street_view:true};
 assert.deepEqual(await x.calculate(x.p),['Street View map point']);
 assert.deepEqual(x.calls,[]);assert.equal(x.pending.has(x.p.id),true);
});
