import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outdoorChanges,needsOutdoorRefresh,refreshOutdoorProperty} from '../outdoor-refresh.js';
import {outdoorMeasurements,listingOutdoorDetails} from '../outdoor-details.js';
const property=()=>({id:'p',address:'Test Road',url:'https://www.zoopla.co.uk/for-sale/details/123',status:'interested',garden_area_sqm:null,garden_description:'rear garden EPC Rating D attractive three-bedroom house',manual_overrides:{},floorplans:[],viewing_at:'2026-12-12T12:11:37Z',comment_sabina:'Owner comment',journey_estimates:{waterloo:{minutes:42}},import_diagnostics:{source_values:{garden_description:'rear garden EPC Rating D attractive three-bedroom house'}}});
test('the Southbrook bracketed imperial/metric sides supply 121.56 sqm without borrowing a room',()=>{
 const items=outdoorMeasurements("Garden\nApproximate =\n57'1 (17.39)\nx 22'11 (6.99)\nBathroom\n9' (2.74)\nx 6' (1.83)");
 assert.equal(items[0].area_sqm,121.56);assert.equal(items[0].dimensions,'17.39 × 6.99 m');
 assert.equal(outdoorMeasurements("To Garden\nConservatory\n3.47m x 2.44m").length,0);
 assert.equal(outdoorMeasurements("Garden\n57'1 (7.39)\nx 22'11 (6.99)")[0].area_sqm,undefined);
});
test('garden excerpts exclude rooms and sales language while retaining parking and access',()=>{
 const text='Side Access to Garden\n\nThe property provides well-proportioned accommodation, featuring sliding doors opening onto the patio and rear garden, creating a pleasant connection between the indoor and outdoor living spaces.\n\nExternally, the property benefits from a rear garden with patio area, providing an ideal space for outdoor entertaining and family enjoyment.\n\nParking: On street';
 const notes=listingOutdoorDetails(text).garden_description;
 assert.match(notes,/Side Access/);assert.match(notes,/patio and rear garden/);assert.match(notes,/Parking: On street/);
 assert.doesNotMatch(notes,/well-proportioned|pleasant connection|ideal space/);
});
test('old automatically imported notes are replaced and the refresh is recorded persistently',()=>{
 const p=property(),measurements=[{outdoor:outdoorMeasurements('Garden\n12.0m x 5.0m')}];
 const patch=outdoorChanges(p,{listingText:'Rear garden with a patio.\n\nOff-street parking for two cars.',measurements});
 assert.equal(patch.garden_area_sqm,60);assert.match(patch.garden_description,/12.0 × 5.0 m/);assert.match(patch.garden_description,/two cars/);assert.doesNotMatch(patch.garden_description,/EPC|three-bedroom/);
 for(const key of ['viewing_at','comment_sabina','journey_estimates','manual_overrides','floor_area_sqm','address','floorplans'])assert.equal(Object.hasOwn(patch,key),false);
 assert.equal(needsOutdoorRefresh({...p,...patch}),false);
});
test('manual values and untracked owner text are retained and missing sizes are not invented',()=>{
 const p=property();p.garden_area_sqm='78.70';p.manual_overrides={garden_area_sqm:true,garden_description:true};
 const patch=outdoorChanges(p,{listingText:'Private garden. Off-street parking.',measurements:[]});
 assert.equal(patch.garden_area_sqm,undefined);assert.equal(patch.garden_description,undefined);assert.equal(patch.import_diagnostics.outdoor_details.dimensions_found,false);
 p.manual_overrides={};p.garden_description='Owner custom text';assert.equal(outdoorChanges(p,{listingText:'Rear garden.'}).garden_description,undefined);
});
test('a failed listing read retains earlier facts, remains retryable and cannot erase annotations',async()=>{
 const p=property(),row=structuredClone(p);let saved;
 const sb={from:()=>({select(){return this},eq(){return this},single:async()=>({data:structuredClone(row)})}),rpc:async(name,args)=>{assert.equal(name,'house_hunt_save_manual_edit');assert.deepEqual(args.p_before,row);saved=args.p_patch;return {data:true}}};
 const result=await refreshOutdoorProperty({sb,property:p,readListing:async()=>{throw Error('Listing unavailable')},photo:async()=>null});
 assert.equal(result.status,'partial');assert.match(saved.import_diagnostics.outdoor_details.errors[0],/Listing unavailable/);assert.equal(needsOutdoorRefresh({...row,...saved}),true);assert.equal(saved.viewing_at,undefined);
});
test('a damaged imperial line cannot hide the clearly printed metric garden sides',()=>{
 const items=outdoorMeasurements('GARDEN\n26\'3" x 21\'s"\n8.00 x 6.50M\n(APPROXIMATE)');assert.equal(items[0].area_sqm,52);assert.equal(items[0].dimensions,'8.00 × 6.50 m');
});
test('bracketed metric sides survive a missing imperial apostrophe only with an agreeing feet/inches split',()=>{
 assert.equal(outdoorMeasurements('Garden\n87\'6 (26.70)\nx 122 (3.71)')[0].area_sqm,99.06);
 assert.equal(outdoorMeasurements('Garden\n876 (26.70)\nx 122 (8.71)')[0].area_sqm,undefined);
});
test('a weaker repeat read of the same plan retains previously verified sides',()=>{
 const p=property(),first=outdoorChanges(p,{listingText:'Rear garden. Parking: On street.',measurements:[{outdoor:outdoorMeasurements('Garden\n12.0m x 5.0m')}]});
 const current={...p,...first},again=outdoorChanges(current,{listingText:'Rear garden. Parking: On street.',measurements:[{outdoor:[{kind:'garden',label:'Garden'}]}]});
 assert.match(again.import_diagnostics.outdoor_details.values.garden_description,/12.0 × 5.0 m/);assert.equal(again.import_diagnostics.outdoor_details.values.garden_area_sqm,60);
});
test('the largest measured garden wins regardless of label/order, while parking is excluded',()=>{
 const plans=outdoorMeasurements('Front Garden\n6m x 5m\nRear Garden\n20m x 5m\nDriveway\n50m x 10m');
 for(const outdoor of [plans,[...plans].reverse()])assert.equal(outdoorChanges(property(),{listingText:'Front garden 6m x 5m',measurements:[{outdoor}]}).garden_area_sqm,100);
 assert.equal(outdoorChanges(property(),{listingText:'Front garden 30m x 5m\nRear garden 20m x 5m'}).garden_area_sqm,150);
});
test('Durnsford reads the large garden before a neighbouring room and keeps the small garden separate',()=>{
 const text='Garden Conservatory\n740x166 6\'9 x 5\'10\n(22.55x5.04m) ; M(2.05 x 1.77m)\nKitchen\n2.10m x 2.08m\nGarden\nGarden Y/\n740 x 166\n(22.55x5.04m) |\nGarden\n20\'0 x 17\'3\n(6.09 x 5.27m)';
 const outdoor=outdoorMeasurements(text),patch=outdoorChanges(property(),{listingText:'74 ft South Facing Garden',measurements:[{outdoor}]});
 assert.equal(patch.garden_area_sqm,113.65);assert.match(patch.garden_description,/22.55 × 5.04 m/);assert.match(patch.garden_description,/6.09 × 5.27 m/);assert.doesNotMatch(patch.garden_description,/2.05 × 1.77 m/);
});
test('a repeated generic Garden label does not discard the other verified garden',()=>{
 const first=outdoorChanges(property(),{listingText:'Gardens.',measurements:[{outdoor:outdoorMeasurements('Garden 20m x 5m\nGarden 6m x 5m')}]});
 const again=outdoorChanges({...property(),...first},{listingText:'Gardens.',measurements:[{outdoor:outdoorMeasurements('Garden 6m x 5m')}]});
 assert.equal(again.import_diagnostics.outdoor_details.values.garden_area_sqm,100);assert.match(again.import_diagnostics.outdoor_details.values.garden_description,/20 × 5 m/);
});
test('two gardens with equal areas and different sides remain separate',()=>{
 const first=outdoorChanges(property(),{listingText:'Gardens.',measurements:[{outdoor:outdoorMeasurements('Garden 20m x 2m\nGarden 10m x 4m')}]});
 const again=outdoorChanges({...property(),...first},{listingText:'Gardens.',measurements:[{outdoor:outdoorMeasurements('Garden 10m x 4m')}]});
 assert.match(again.import_diagnostics.outdoor_details.values.garden_description,/20 × 2 m/);assert.match(again.import_diagnostics.outdoor_details.values.garden_description,/10 × 4 m/);
});
test('one recalculation saves the advertised house size and largest garden together',()=>{
 const p={...property(),floor_area_sqm:85,import_diagnostics:{source_values:{floor_area_sqm:85}}};
 const patch=outdoorChanges(p,{listingText:'Rear garden and off-street parking.',listingData:{floor_area_sqm:92},measurements:[{floor_area_sqm:100,outdoor:outdoorMeasurements('Front garden 3m x 4m\nRear garden 20m x 5m')}]});
 assert.equal(patch.floor_area_sqm,92);assert.equal(patch.garden_area_sqm,100);
 assert.equal(patch.import_diagnostics.floorplan_measurements.labelled_values.floor_area_sqm,100);
 assert.equal(patch.import_diagnostics.source_values.floor_area_sqm,92);
});
test('a missing advertised size falls back to the plan and a failed reread cannot clear it',()=>{
 const p={...property(),floor_area_sqm:null};
 const first=outdoorChanges(p,{listingText:'Rear garden.',listingData:{floor_area_sqm:null},measurements:[{floor_area_sqm:102.4,outdoor:outdoorMeasurements('Garden 15m x 5m')}]});
 assert.equal(first.floor_area_sqm,102.4);
 const again=outdoorChanges({...p,...first},{listingText:'',listingData:{floor_area_sqm:null},measurements:[],errors:['OCR unavailable']});
 assert.equal(again.floor_area_sqm,undefined);assert.equal(again.garden_area_sqm,undefined);assert.equal(again.garden_description,undefined);
});
test('house and garden manual values survive a complete recalculation',()=>{
 const p={...property(),floor_area_sqm:90,garden_area_sqm:150,manual_overrides:{floor_area_sqm:true,garden_area_sqm:true,garden_description:true}};
 const patch=outdoorChanges(p,{listingText:'Garden 20m x 5m',listingData:{floor_area_sqm:100},measurements:[{floor_area_sqm:105}]});
 assert.equal(patch.floor_area_sqm,undefined);assert.equal(patch.garden_area_sqm,undefined);assert.equal(patch.garden_description,undefined);
});
test('a weaker read retains front/rear gardens even when their sides were never labelled',()=>{
 const p=property();p.floorplans=[{path:'same-plan.jpg'}];
 const first=outdoorChanges(p,{listingText:'Private garden.',measurements:[{outdoor:outdoorMeasurements('Front garden\nRear garden')}]});
 const again=outdoorChanges({...p,...first},{listingText:'Private garden.',measurements:[{outdoor:[]}]});
 assert.equal(again.garden_description,undefined);
 assert.deepEqual(again.import_diagnostics.outdoor_details.measurements,first.import_diagnostics.outdoor_details.measurements);
});
