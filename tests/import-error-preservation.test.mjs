import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('failed listing read preserves saved import history and user edits',async()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('async function enrichProperty(p){');
 const end=html.indexOf('async function updateFromListing()',start);
 const source=html.slice(start,end);
 let databaseTouched=false;
 const sb={from(){databaseTouched=true;throw Error('Unexpected database mutation')}};
 const extension=async()=>{throw Error('Listing temporarily unavailable')};
 const enrich=new Function('extension','sb',source+';return enrichProperty')(extension,sb);
 const p={id:'house',url:'https://example.com',import_diagnostics:{source_values:{price:500000},media_source_revision:'source-gallery-20261031'},manual_overrides:{price:true}};
 const before=JSON.stringify(p);
 await assert.rejects(enrich(p),/Listing temporarily unavailable/);
 assert.equal(databaseTouched,false);
 assert.equal(JSON.stringify(p),before);
});
