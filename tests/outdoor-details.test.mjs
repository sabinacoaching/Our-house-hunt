import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {outdoorMeasurements,listingOutdoorDetails,combineOutdoorDescription,normalizeListingOutdoors} from '../outdoor-details.js';
import {parsePlanText,floorplanChanges,analyzeFloorplan} from '../floorplan-ocr.js';
import {importChanges} from '../import-utils.js';
const listing=JSON.parse(readFileSync(new URL('./fixtures/central-road-listing.json',import.meta.url)));
const text=[...listing.features.bullets,listing.detailedDescription].join('\n\n');
const ocr=readFileSync(new URL('./fixtures/central-road-ocr.txt',import.meta.url),'utf8');
const bands={headerText:'Central Road, Morden SM4 86.0 sq m / 925 sq ft',footerText:'86.0 sq m / 925 sq ft   2.2 sq m / 23 sq ft 147.6 sq m / 1588 sq ft'};
test('Central Road reads the labelled garden across imperial and metric lines and its separate driveway',()=>{
 const p=parsePlanText(ocr,bands);assert.equal(p.floor_area_sqm,86);assert.equal(p.garden_area_sqm,95.76);
 assert.equal(p.outdoor.find(x=>x.label==='Garden').dimensions,'12.70 × 7.54 m');
 assert.equal(p.outdoor.find(x=>x.label==='Driveway').dimensions,'7.54 × 6.89 m');
});
test('a repeated total is accepted only when the header and footer metric/imperial pairs agree',()=>{
 assert.equal(parsePlanText('Kitchen\nBedroom',bands).floor_area_sqm,86);
 assert.equal(parsePlanText('Kitchen\nBedroom',{...bands,footerText:'86.0 qm / 925 oq tt'}).floor_area_sqm,86);
 assert.equal(parsePlanText('Kitchen\nBedroom',{...bands,footerText:'68.0 sq m / 732 sq ft'}).floor_area_sqm,undefined);
 assert.equal(parsePlanText('Kitchen\nBedroom',{headerText:'68.0 sq m / 925 sq ft',footerText:'68.0 sq m / 925 sq ft'}).floor_area_sqm,undefined);
});
test('the advertised area stays authoritative while the plan supplies outdoor dimensions and its fallback total',()=>{
 const p={floor_area_sqm:68.01,garden_area_sqm:null,garden_description:'',manual_overrides:{},import_diagnostics:{source_values:{floor_area_sqm:68.01,garden_description:''}},viewing_at:'2026-12-12T12:00:00Z',comment_sabina:'Keep'};
 const patch=floorplanChanges(p,parsePlanText(ocr,bands),{listingText:text});
 assert.equal(patch.floor_area_sqm,undefined);assert.equal(patch.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,86);assert.equal(patch.garden_area_sqm,95.76);
 assert.match(patch.garden_description,/Off Street Parking for 2 Cars/);assert.match(patch.garden_description,/South-East Facing Garden/);
 assert.match(patch.garden_description,/driveway for two cars and useful side access/);assert.match(patch.garden_description,/12.70 × 7.54 m/);assert.match(patch.garden_description,/7.54 × 6.89 m/);
 assert.equal(patch.viewing_at,undefined);assert.equal(patch.comment_sabina,undefined);assert.equal(p.floor_area_sqm,68.01);
});
test('plan gross internal area is a fallback only when the advertised area is missing',()=>{
 const patch=floorplanChanges({floor_area_sqm:null,manual_overrides:{},import_diagnostics:{}},parsePlanText(ocr,bands));
 assert.equal(patch.floor_area_sqm,86);
 const source=importChanges({floor_area_sqm:'86.00',manual_overrides:{},import_diagnostics:{source_values:{floor_area_sqm:null},floorplan_measurements:{values:{floor_area_sqm:86}}}},{floor_area_sqm:68.01});
 assert.equal(source.floor_area_sqm,68.01);
 const manual=importChanges({floor_area_sqm:86,manual_overrides:{floor_area_sqm:true},import_diagnostics:{floorplan_measurements:{values:{floor_area_sqm:86}}}},{floor_area_sqm:68.01});assert.equal(manual.floor_area_sqm,undefined);
});
test('manual dimensions and custom notes survive a better source, with and without override flags',()=>{
 for(const manual_overrides of [{},{floor_area_sqm:true,garden_area_sqm:true,garden_description:true}]){
  const patch=floorplanChanges({floor_area_sqm:90,garden_area_sqm:110,garden_description:'Owner notes',manual_overrides,import_diagnostics:{source_values:{floor_area_sqm:68.01,garden_area_sqm:null,garden_description:''}}},parsePlanText(ocr,bands),{listingText:text});
  for(const field of ['floor_area_sqm','garden_area_sqm','garden_description'])assert.equal(patch[field],undefined);
 }
});
test('front and rear dimensions stay separate and a room cannot supply the garden measurement',()=>{
 const details=listingOutdoorDetails('Front garden 4.0m x 3.0m\n\nRear garden\n12.0m x 5.0m\n\nParking\nPermit parking only. No driveway.');
 assert.equal(details.garden_area_sqm,60);assert.equal(details.measurements.find(x=>x.kind==='front_garden').area_sqm,12);
 assert.match(details.garden_description,/Permit parking only/);assert.match(details.garden_description,/No driveway/);
 assert.equal(parsePlanText('Garden\nBathroom\n4.6 x 5.0m').garden_area_sqm,undefined);
 assert.equal(parsePlanText('Front garden\n4.6 x 5.0m').garden_area_sqm,23);
 assert.equal(parsePlanText('Kitchen opening to garden 4.6 x 5.0m').garden_area_sqm,undefined);
});
test('source garden paragraphs and all parking statements are retained without a 230-character cut',()=>{
 const content='Rear garden\nMainly laid to lawn with established borders and a patio. A side gate provides pedestrian access.\n\nKitchen\nModern fitted units.\n\nFront garden 3m x 4m\n\nNo off-street parking. Residents permit parking on the road. The garage is for storage only.';
 const data=listingOutdoorDetails(content);assert.match(data.garden_description,/established borders/);assert.match(data.garden_description,/side gate/);
 assert.match(data.garden_description,/No off-street parking/);assert.match(data.garden_description,/permit parking/);assert.match(data.garden_description,/storage only/);
 assert.doesNotMatch(data.garden_description,/Modern fitted units/);
 assert.equal(normalizeListingOutdoors({listing_text:text}).garden_description.includes('driveway for two cars'),true);
 const description=combineOutdoorDescription(content,outdoorMeasurements('Front garden\n3m x 4m\nRear Garden\n15m x 5m'));
 assert.match(description,/Front garden \(floor plan\): 3 × 4 m/);assert.match(description,/Rear garden \(floor plan\): 15 × 5 m/);
});
test('plan save compares the fresh whole row and retains a completed concurrent route/date edit',async()=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.localStorage;
 globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(['plan'],{type:'image/jpeg'})});globalThis.localStorage={getItem:()=>null,setItem(){}};
 const p={id:'one',floorplans:[{path:'plan.jpg'}],floor_area_sqm:68.01,garden_area_sqm:null,manual_overrides:{},import_diagnostics:{source_values:{floor_area_sqm:68.01}}};
 const current={...structuredClone(p),viewing_at:'2026-12-12T12:00:00Z',comment_david:'New decision',journey_estimates:{waterloo:{minutes:30}}};
 const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(current)})}),rpc:async(name,args)=>{assert.equal(name,'house_hunt_save_manual_edit');assert.deepEqual(args.p_before,current);assert.equal(args.p_patch.viewing_at,undefined);return {data:false}}};
 try{const result=await analyzeFloorplan({sb,property:p,photo:async()=>'/plan',recognize:async()=>({text:ocr,...bands})});assert.equal(result.status,'concurrent-edit');assert.equal(p.floor_area_sqm,68.01)}
 finally{globalThis.fetch=oldFetch;globalThis.localStorage=oldStorage}
});
test('the single-plan path cannot shrink the saved largest garden on a weaker OCR pass',()=>{
 const p={garden_area_sqm:100,floorplans:[{path:'plan.jpg'}],manual_overrides:{},import_diagnostics:{outdoor_details:{plan_fingerprint:'plan.jpg',values:{garden_area_sqm:100},measurements:outdoorMeasurements('Garden 20m x 5m\nGarden 6m x 5m')}}};
 const patch=floorplanChanges(p,parsePlanText('Garden 6m x 5m'),{fingerprint:'plan.jpg'});
 assert.equal(patch.garden_area_sqm,undefined);assert.match(patch.garden_description,/20 × 5 m/);
 assert.equal(patch.import_diagnostics.floorplan_measurements.labelled_values.garden_area_sqm,100);
});
test('a published garden length is retained in notes without inventing its width or area',()=>{
 const items=outdoorMeasurements("Rear garden extends to\n35'0\" (10.67m)\nKitchen\n4m x 3m");
 assert.equal(items[0].length_m,10.67);assert.equal(items[0].area_sqm,undefined);
 assert.match(combineOutdoorDescription('',items),/length 10.67 m; width not stated/);
 assert.equal(parsePlanText("Garden\n74 feet").garden_area_sqm,undefined);
 assert.equal(outdoorMeasurements('To Garden\nConservatory\n10m').length,0);
 const abingdon=outdoorMeasurements("Rear Garden\nApproximate\n41'4 (12.60)\nKitchen\n4m x 3m\nFront Garden\nApproximate\n15'6 (4.72)");
 assert.equal(abingdon[0].length_m,12.60);assert.equal(abingdon[1].length_m,4.72);assert.equal(abingdon[0].area_sqm,undefined);
});

test('extracts parking from a feature list without station or council tax and removes repeated long phrases',()=>{
 const d=listingOutdoorDetails('Garage | 0.2 Miles to Mitcham Tram Stop | Council Tax Band: D |\nPrivate driveway for a minimum of two cars.\nPrivate driveway for a minimum of two cars. The rear garden has a patio.');
 assert.match(d.garden_description,/Garage/);assert.doesNotMatch(d.garden_description,/Tram Stop|Council Tax/);
 assert.equal((d.garden_description.match(/Private driveway for a minimum of two cars/g)||[]).length,1);
 assert.match(d.garden_description,/rear garden has a patio/);
});
test('outdoor description removes indoor fragments and unrelated feature-list material',()=>{
 const notes=listingOutdoorDetails('Garage | 0.2 Miles to Mitcham Tram Stop | Council Tax Band: D |\nall necessary appliances and overlooks the South Westerly facing garden.\nKitchen with access to the rear garden.\na good-sized private rear garden, perfect for outdoor entertaining. Further benefits include side access.').garden_description;
 assert.match(notes,/Garage/);assert.match(notes,/South Westerly facing garden/);assert.match(notes,/good-sized private rear garden/);assert.match(notes,/side access/i);assert.doesNotMatch(notes,/appliances|kitchen|Council|Tram/);
});
