import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {validStreetViewHint} from '../import-utils.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function blob64('),html.indexOf('// Resume only imports'))+'\n'+
 html.slice(html.indexOf('async function enrichWalkingStations('),html.indexOf('// Existing catalogue files'));

test('a new import carries the source point through photos, plan, stations and saved journeys',async()=>{
 const db=new Map(),files=new Map(),pending=new Set();let reports=[];
 const matches=(v,op,x)=>op==='eq'?JSON.stringify(v)===JSON.stringify(x):op==='is'?v==null:op==='gte'?v>=x:v<=x;
 const sb={storage:{from:()=>({
  async upload(path,blob){files.set(path,blob);return {error:null}},
  async download(path){return {data:files.get(path),error:null}}
 })},functions:{invoke:async(name,{body})=>{
  const p=db.get(body.id);
  if(name==='house-hunt-journeys'){
   p.journey_estimates=Object.fromEntries(['waterloo','dilly','dancelab'].map(k=>[k,{minutes:50}]));
   return {data:{journeys:p.journey_estimates,errors:[]}};
  }
  return {data:{commutes:{tfl_final:{complete:true}}}};
 }},from(){
  let patch=null,filters=[];
  const rows=()=>[...db.values()].filter(row=>filters.every(([k,op,v])=>matches(row[k],op,v)));
  const result=()=>{const found=rows();if(patch)found.forEach(p=>Object.assign(p,structuredClone(patch)));return {data:found.map(p=>structuredClone(p)),error:null}};
  return {insert:async p=>{db.set(p.id,{manual_overrides:{},station_commutes:{},journey_estimates:{},...structuredClone(p)});return {error:null}},
   update(v){patch=v;return this},select(){return this},eq(k,v){let x=v;if(typeof v==='string'&&/^[{[]/.test(v)){try{x=JSON.parse(v)}catch{}}filters.push([k,'eq',x]);return this},is(k,v){filters.push([k,'is',v]);return this},gte(k,v){filters.push([k,'gte',v]);return this},lte(k,v){filters.push([k,'lte',v]);return this},
   async single(){return {data:result().data[0]||null,error:null}},async maybeSingle(){return {data:result().data[0]||null,error:null}},then(resolve){resolve(result())}};
 }};
 const listing='https://www.zoopla.co.uk/for-sale/details/123';
 const source={source:'Zoopla',title:'Example',address:'Example Road, Isleworth',price:500000,bedrooms:3,bathrooms:1,floors:2,floor_area_sqm:100,extension_version:'0.14.0',images:['photo-one','photo-two'],floorplans:['plan-one'],location_hint:{source:'listing-street-view',latitude:51.469343,longitude:-0.340935,address:'10 Example Road, Isleworth'}};
 const extension=async(action,{url}={})=>action==='IMPORT_URL'?structuredClone(source):{mime:'image/jpeg',base64:Buffer.from(url.repeat(250)).toString('base64')};
 const fetch=async url=>String(url).includes('api.tfl.gov.uk/StopPoint?')?{ok:true,json:async()=>({stopPoints:[
  {commonName:'Alpha Rail Station',lat:51.47,lon:-.341,modes:['national-rail']},
  {commonName:'Beta Rail Station',lat:51.471,lon:-.342,modes:['national-rail']},
  {commonName:'Gamma Rail Station',lat:51.472,lon:-.343,modes:['national-rail']}]})}:{ok:true,json:async()=>({routes:[{distance:1200,duration:900}]})};
 const digest=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
 const run=new Function('sb','pendingJourneyImportIds','extension','probeImporter','listing','user','crypto','photoDigest','report','mediaRevision','refresh','analyzeFloorplan','photo','finishNewHouseImport','fetch','validateGeocode','routeDelay','haversine','inspectFloorplanImage','validStreetViewHint','queueGoogleHouse',code+';return importHouse');
 const importHouse=run(sb,pending,extension,async()=>true,x=>x,{id:'member'},webcrypto,digest,s=>reports.push(s),'v1',async()=>{},async()=>{},async()=>'',async()=>{throw Error('unexpected retry')},fetch,()=>false,async()=>{},()=>500,async()=>({accepted:true}),validStreetViewHint,async()=>{});
 await importHouse(listing);
 assert.equal(db.size,1);const p=[...db.values()][0];
 assert.equal(p.latitude,source.location_hint.latitude);assert.equal(p.longitude,source.location_hint.longitude);
 assert.equal(p.images.length,2);assert.equal(p.floorplans.length,1);assert.equal(files.size,3);
 assert.deepEqual([p.station_name,p.station_2_name,p.station_3_name],['Alpha','Beta','Gamma']);
 assert.deepEqual(Object.keys(p.journey_estimates).sort(),['dancelab','dilly','waterloo']);
 assert.equal(p.import_diagnostics.route_pending,false);assert.match(reports.at(-1),/House imported/);
});
