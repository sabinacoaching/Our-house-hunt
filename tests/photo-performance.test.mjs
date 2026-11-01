import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUniquePhotoStore} from '../photo-dedup.js';

test('stored fingerprints show all unique photos in order without downloading them',async()=>{
 const images=Array.from({length:29},(_,i)=>({path:'house/'+i}));
 const metadata=new Map(images.map((x,i)=>[x.path,'etag:'+i]));
 metadata.set(images[1].path,metadata.get(images[0].path));
 let photoCalls=0,metaCalls=0;
 const store=createUniquePhotoStore(async()=>{photoCalls++;throw Error('must not download')},async()=>{metaCalls++;return metadata});
 const house={id:'house',images};
 const [table,details]=await Promise.all([store.unique(house,4),store.unique(house)]);
 assert.deepEqual(table.map(x=>x.path),['house/0','house/2','house/3','house/4']);
 assert.equal(details.length,28);assert.equal(details.at(-1).path,'house/28');assert.equal(photoCalls,0);assert.equal(metaCalls,2);
});
test('newly imported source hashes avoid downloading photographs again',async()=>{
 const images=[{path:'a',sha256:'a'.repeat(64)},{path:'b',sha256:'a'.repeat(64)},{path:'c',sha256:'c'.repeat(64)}];
 let calls=0;const store=createUniquePhotoStore(async()=>{throw Error('unexpected photo request')},async()=>{calls++;return new Map()});
 assert.deepEqual((await store.unique({id:'house',images})).map(x=>x.path),['a','c']);assert.equal(calls,0);
});
test('the photo viewer opens before the gallery lookup finishes',async()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('async function openPhotoBrowser('),html.indexOf('function movePhoto('));
 let release;const waiting=new Promise(resolve=>{release=resolve});
 const els={photoDialog:{open:false,showModal(){this.open=true}},photoTitle:{},photoCount:{},photoFull:{removeAttribute(){}}};
 const create=new Function('$','uniquePhotos','photo','console',`let photoRequest=0,activePhotoProperty=null,activePhotoIndex=0;${source}; return openPhotoBrowser`);
 const open=create(id=>els[id],()=>waiting,async()=>'image',console);
 const result=open({address:'House'},0);assert.equal(els.photoDialog.open,true);assert.equal(els.photoFull.alt,'Loading photographs');
 release([{path:'a'}]);await result;assert.equal(els.photoFull.src,'image');
});
test('opening the catalogue and repeated imports do not refresh existing listings',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const show=html.slice(html.indexOf('async function show(){'),html.indexOf("$('loginForm').onsubmit"));
 const duplicate=html.slice(html.indexOf(' if(check.data){'),html.indexOf(" report('Reading listing and photographs"));
 assert.doesNotMatch(show,/repairExistingMedia|resumePendingRoutes|autoFillMissing/);
 assert.doesNotMatch(duplicate,/extension\(|enrichProperty\(|archive\(/);
});
