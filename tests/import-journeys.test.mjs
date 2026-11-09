import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('async function calculateImportRoutes('),html.indexOf('// Resume only imports'));
function setup(failure=false){const p={id:'house'},pending=new Set([p.id]),calls=[];const queue=async id=>{calls.push(id);if(failure)throw Error('Google Maps unavailable')};const calculate=new Function('pendingJourneyImportIds','queueGoogleHouse',code+';return calculateImportRoutes')(pending,queue);return {p,pending,calls,calculate}}
test('a new import finishes routes only after the Google calculation succeeds',async()=>{const x=setup();assert.deepEqual(await x.calculate(x.p),[]);assert.deepEqual(x.calls,['house']);assert.equal(x.pending.has('house'),false)});
test('failed Google routing remains pending and is not called complete',async()=>{const x=setup(true);assert.match((await x.calculate(x.p))[0],/Google routes/);assert.equal(x.pending.has('house'),true)});
test('completed imports do not calculate again',async()=>{const x=setup();x.pending.clear();assert.deepEqual(await x.calculate(x.p),[]);assert.equal(x.calls.length,0)});
