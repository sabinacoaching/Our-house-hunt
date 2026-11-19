import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImportQueue} from '../import-queue.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait()}throw Error('Timed out')};
test('accepts more links while the first import runs, persists them and prevents duplicate URLs',async()=>{
 const storage=memory();let release;const calls=[];const gate=new Promise(r=>release=r);
 const queue=createImportQueue({storage,key:'q',makeId:(()=>{let n=0;return()=>String(++n)})(),run:async url=>{calls.push(url);if(url==='one')await gate}});
 await queue.enqueue('one');await until(()=>calls.length===1);
 await queue.enqueue('two');assert.equal((await queue.enqueue('two')).duplicate,true);
 assert.deepEqual(queue.read().map(x=>[x.url,x.status]),[['one','running'],['two','pending']]);
 release();await until(()=>queue.read().length===0);assert.deepEqual(calls,['one','two']);
});
test('an interrupted job is retried after reopening and failed links stay available for retry',async()=>{
 const storage=memory();storage.setItem('q',JSON.stringify([{id:'1',url:'one',status:'running'},{id:'2',url:'two',status:'pending'}]));let attempt=0;
 const queue=createImportQueue({storage,key:'q',run:async url=>{if(url==='one'&&attempt++===0)throw Error('offline')}});
 await queue.pump();assert.deepEqual(queue.read().map(x=>[x.url,x.status,x.error]),[['one','failed','offline']]);
 await queue.retry('1');await until(()=>queue.read().length===0);assert.equal(attempt,2);
});
test('a storage failure does not report a queued link',async()=>{
 let called=0;const queue=createImportQueue({storage:{getItem:()=>null,setItem:()=>{throw Error('storage full')}},key:'q',makeId:()=>String(++called),run:()=>{throw Error('unexpected')}});
 await assert.rejects(queue.enqueue('one'),/storage full/);
});
test('removing a queued item cannot remove an import already running',async()=>{
 const storage=memory();let release;const gate=new Promise(r=>release=r);let n=0;
 const queue=createImportQueue({storage,key:'q',makeId:()=>String(++n),run:()=>gate});
 await queue.enqueue('one');await until(()=>queue.read()[0]?.status==='running');await queue.enqueue('two');
 await queue.remove('1');await queue.remove('2');assert.deepEqual(queue.read().map(x=>x.url),['one']);release();await until(()=>queue.read().length===0);
});
test('two tabs share a single worker and concurrently queued links are retained',async()=>{
 const storage=memory(),owners=new Map(),tails=new Map();let release;const gate=new Promise(r=>release=r),calls=[];let n=0;
 const locks={request:async(name,options,cb)=>{
  if(typeof options==='function'){cb=options;const previous=tails.get(name)||Promise.resolve();let done;const next=new Promise(r=>done=r);tails.set(name,previous.then(()=>next));await previous;try{return await cb({name})}finally{done()}}
  if(owners.has(name))return cb(null);owners.set(name,true);try{return await cb({name})}finally{owners.delete(name)}
 }};
 const opts={storage,key:'same',locks,makeId:()=>String(++n),run:async url=>{calls.push(url);if(url==='one')await gate}};
 const a=createImportQueue(opts),b=createImportQueue(opts);await a.enqueue('one');await until(()=>calls.length===1);
 await Promise.all([a.enqueue('two'),b.enqueue('three')]);assert.equal(a.read().length,3);await b.pump();assert.deepEqual(calls,['one']);
 release();await until(()=>a.read().length===0);assert.deepEqual(calls,['one','two','three']);
});
