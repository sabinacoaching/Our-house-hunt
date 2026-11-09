import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {calculateGoogleRoutes} from '../google-routes-runner.js';
import {validStreetViewHint,sameStreet,streetViewListingUrl} from '../import-utils.js';

// Exercise the modern import entry point and the real controller together.
// External listing/Maps responses and database transport are deterministic fixtures.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const importCode=html.slice(html.indexOf('function blob64('),html.indexOf('// Resume only imports'));
const date='2026-11-10',deadlines={waterloo:'07:40',dilly:'18:40',dancelab:'19:50'};
const examples=[
 {url:'https://www.zoopla.co.uk/for-sale/details/100001',address:'23 Future Road, Isleworth',lat:51.47,lon:-.33},
 {url:'https://www.rightmove.co.uk/properties/100002',address:'8 Future Lane, Twickenham',lat:51.45,lon:-.35},
 {url:'https://www.zoopla.co.uk/for-sale/details/100003',address:'Future Close, London',lat:51.38,lon:-.10},
 {url:'https://www.rightmove.co.uk/properties/100004',address:'Future Gardens, London',lat:51.50,lon:-.30}
];

function harness({missingAddress=false}={}){
 const rows=new Map(),files=new Map(),pending=new Set(),calls=[],reports=[],retries=[];
 let failingAddress=null;
 const clone=value=>structuredClone(value);
 const sb={storage:{from:()=>({
  async upload(path,blob){files.set(path,blob);return {error:null}},
  async download(path){return {data:files.get(path),error:null}}
 })},from(){
  let patch=null,filters=[];
  const selected=()=>[...rows.values()].filter(row=>filters.every(([key,value])=>JSON.stringify(row[key])===JSON.stringify(value)));
  const result=()=>{const found=selected();if(patch)for(const p of found)Object.assign(p,clone(patch));return {data:found.map(clone),error:null}};
  return {
   async insert(p){rows.set(p.id,{manual_overrides:{},station_commutes:{},journey_estimates:{},comment_sabina:'Preserve user comment',...clone(p)});return {error:null}},
   update(value){patch=value;return this},select(){return this},
   eq(key,value){if(typeof value==='string'&&/^[{[]/.test(value))try{value=JSON.parse(value)}catch{}filters.push([key,value]);return this},
   is(key,value){filters.push([key,value]);return this},
   async single(){return {data:result().data[0]||null,error:null}},
   async maybeSingle(){return {data:result().data[0]||null,error:null}},
   then(resolve){resolve(result())}
  };
 },functions:{async invoke(name,{body}){
  assert.equal(name,'house-hunt-station-commutes','modern imports must not call a legacy journey router');
  assert.equal(body.metadata_only,true);
  const p=rows.get(body.id),origin=p.latitude+','+p.longitude;
  return {data:{metadata:{origin,protected_names:[null,null,null],errors:[],candidates:[{
   name:'Fixture station '+p.address,station_id:'station-'+p.id,
   entrances:[{entrance_id:'entrance-'+p.id,lat:p.latitude+.001,lon:p.longitude+.001}]
  }]}}};
 }},async rpc(name,args){
  assert.equal(name,'house_hunt_save_google_routes');
  const p=rows.get(args.p_id);assert.deepEqual(args.p_before,p);
  assert.equal(args.p_patch.address,undefined);assert.equal(args.p_patch.comment_sabina,undefined);
  rows.set(p.id,{...p,...clone(args.p_patch)});return {data:true};
 }};
 const extension=async(action,args={})=>{
  if(action==='PING')return {version:'0.17.0'};
  if(action==='IMPORT_URL'){
   const item=examples.find(x=>new URL(x.url).pathname===new URL(args.url).pathname);assert.ok(item,'requested listing must come from the imported URL');
   return {source:item.url.includes('zoopla')?'Zoopla':'Rightmove',title:item.address,address:missingAddress?'':item.address,
    extension_version:'0.17.0',bedrooms:3,bathrooms:1,floors:2,floor_area_sqm:100,
    images:[item.url+'/photo'],floorplans:[item.url+'/plan'],
    location_hint:{source:'listing-street-view',address:'Adjacent Street, London',latitude:item.lat,longitude:item.lon}};
  }
  if(action==='FETCH_IMAGE')return {mime:'image/jpeg',base64:Buffer.from(args.url.repeat(100)).toString('base64')};
  assert.equal(action,'GOOGLE_ROUTE');
  const {route}=args,origin=route.origin.lat+','+route.origin.lon;
  const p=[...rows.values()].find(x=>x.latitude===route.origin.lat&&x.longitude===route.origin.lon);assert.ok(p,'every route uses its own imported point');
  calls.push({id:p.id,kind:route.kind,origin});
  if(p.address===failingAddress&&route.kind==='dilly')throw Error('network failed');
  const destination=route.destination?.query||(route.destination?route.destination.lat+','+route.destination.lon:'Fixture destination '+route.kind);
  if(route.kind==='station_walk')return {source:'Google Maps',origin,destination,station_id:route.destination?.station_id,walking_miles:.2,walking_minutes:5};
  if(route.kind==='station_transit')return {source:'Google Maps',origin,destination,station_id:route.destination?.station_id,unavailable:true};
  const arrival=date+'T'+deadlines[route.kind]+':00',departure=new Date(Date.parse(arrival+'Z')-30*60000).toISOString().slice(0,19);
  return {source:'Google Maps',origin,destination,date,departure,arrival,minutes:30};
 };
 const options={sb,extension,routingDate:date,delay:async()=>{}};
 const queue=id=>calculateGoogleRoutes(id,options);
 const digest=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
 const make=new Function('sb','pendingJourneyImportIds','extension','probeImporter','listing','user','crypto','photoDigest','report','mediaRevision','refresh','analyzeFloorplan','photo','finishNewHouseImport','inspectFloorplanImage','validStreetViewHint','sameStreet','streetViewListingUrl','queueGoogleHouse',importCode+';return importHouse');
 const importHouse=make(sb,pending,extension,async()=>true,x=>x,{id:'member'},webcrypto,digest,x=>reports.push(x),'fixture',async()=>{},async()=>{},async()=>'',async id=>retries.push(id),async()=>({accepted:true}),validStreetViewHint,sameStreet,streetViewListingUrl,queue);
 return {rows,calls,files,retries,importHouse,queue,fail:address=>{failingAddress=address}};
}

test('every new Zoopla and Rightmove import runs the production Google controller for its own point',async()=>{
 const h=harness();
 for(const item of examples){
  await h.importHouse(item.url);
  const p=[...h.rows.values()].find(x=>x.url===item.url);
  assert.equal(p.address,item.address,'a neighbouring panorama must not replace the address');
  assert.equal(p.latitude,item.lat);assert.equal(p.longitude,item.lon);
  assert.equal(p.import_diagnostics.route_pending,false);
  assert.equal(p.import_diagnostics.google_routes_version,'google-maps-ui-v2');
  assert.deepEqual(Object.keys(p.journey_estimates).sort(),['dancelab','dilly','waterloo']);
  assert.deepEqual(h.calls.filter(x=>x.id===p.id).map(x=>x.kind),['waterloo','dilly','dancelab','station_walk','station_transit']);
  assert.ok(p.station_name);assert.equal(p.station_commutes.google_routes.results[0].walking_minutes,5);
  assert.equal(p.comment_sabina,'Preserve user comment');
  const count=h.calls.length;assert.deepEqual(await h.queue(p.id),{alreadyDone:true});assert.equal(h.calls.length,count);
 }
 assert.equal(h.rows.size,examples.length);assert.equal(h.files.size,examples.length*2);assert.deepEqual(h.retries,[]);
});

test('an interrupted new import retains its other results and resumes only the missing component',async()=>{
 const h=harness(),item=examples[1];h.fail(item.address);
 await h.importHouse(item.url);
 const p=[...h.rows.values()][0];
 assert.equal(p.import_diagnostics.route_pending,true);assert.equal(p.journey_estimates.waterloo.minutes,30);
 assert.equal(p.journey_estimates.dancelab.minutes,30);assert.ok(p.station_name);
 assert.match(p.import_diagnostics.google_routes_work.errors.dilly,/network failed/);assert.deepEqual(h.retries,[p.id]);
 h.fail(null);const count=h.calls.length;await h.queue(p.id);
 assert.deepEqual(h.calls.slice(count).map(x=>x.kind),['dilly']);
 assert.equal(h.rows.get(p.id).import_diagnostics.route_pending,false);
 assert.equal(h.rows.get(p.id).comment_sabina,'Preserve user comment');
});

test('a partial listing with no address is rejected before creating a catalogue row or uploading media',async()=>{
 const h=harness({missingAddress:true});
 await assert.rejects(()=>h.importHouse(examples[0].url),/original listing address could not be read/i);
 assert.equal(h.rows.size,0);assert.equal(h.files.size,0);assert.equal(h.calls.length,0);
});
