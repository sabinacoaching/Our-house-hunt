import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createUniquePhotoStore} from '../photo-dedup.js';

const here=fileURLToPath(new URL('.',import.meta.url));
const edge=readFileSync(new URL('../server/verified-routes.ts',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'');
const loadBackend=async(mockFetch=async()=>({ok:true,json:async()=>({routes:[{duration:'2400s'},{duration:'1800s'}]})}))=>{
 const factory=new Function('Deno','createClient','fetch','Response','AbortSignal','URLSearchParams',edge+';return {normalizeStreet,validateGeocode,londonArrival,googleRoute};');
 return factory({env:{get:()=>''},serve(){}},()=>({}),mockFetch,class {},{timeout(){}},URLSearchParams);
};
const geocode=(number,street='Dunston Rd')=>({address_components:[{types:['street_number'],long_name:number},{types:['route'],long_name:street},{types:['country'],short_name:'GB'}],partial_match:false,place_id:'test',geometry:{location_type:'ROOFTOP',location:{lat:51.4,lng:-.15}}});
test('110 Dunston Road cannot be replaced with 44 Dunston Road',async()=>{
 const a=await loadBackend();
 assert.equal(a.validateGeocode('110 Dunston Road, Battersea',geocode('44')).ok,false);
 assert.equal(a.validateGeocode('110 Dunston Road, Battersea',geocode('110')).ok,true);
 assert.equal(a.validateGeocode('110 Dunston Road, Battersea',geocode('110','Dunston Avenue')).ok,false);
});
test('London arrival respects winter and summer time',async()=>{
 const a=await loadBackend();
 assert.equal(a.londonArrival('2026-11-03','19:50'),'2026-11-03T19:50:00.000Z');
 assert.equal(a.londonArrival('2026-07-07','19:50'),'2026-07-07T18:50:00.000Z');
});
test('choose fastest returned transit route, not the nearest arrival',async()=>{
 const a=await loadBackend();
 const r=await a.googleRoute('fake','verified-origin',{lat:51.5,lon:-.1},'TRANSIT','2026-11-03T19:50:00Z');
 assert.equal(r.route.seconds,1800);
 assert.equal(r.alternatives,2);
});
test('photo galleries compare content across distinct file paths and do not delete original array',async()=>{
 const keep={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};
 const same={path:'a'},copy={path:'b'},distinct={path:'c'};
 const source=[same,copy,distinct],original=JSON.stringify(source);
 const images={a:'kitchen',b:'kitchen',c:'garden'};
 let seed='';let fetched=0;
 globalThis.fetch=async url=>{fetched++;return {ok:true,blob:async()=>({key:images[url]})}};
 globalThis.createImageBitmap=async blob=>({key:blob.key,close(){}});
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},drawImage(image){seed=image.key},getImageData(){
   let state=Array.from(seed).reduce((n,ch)=>(Math.imul(n,33)+ch.charCodeAt(0))>>>0,1337);
   const data=new Uint8ClampedArray(17*16*4);
   for(let i=0;i<17*16;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;
    const v=state%255;data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255}
   return {data};
 }})})};
 try{
  const store=createUniquePhotoStore(async x=>x.path),p={id:'123',images:source};
  const [table,details]=await Promise.all([store.unique(p,4),store.unique(p)]);
  assert.deepEqual(details.map(x=>x.path),['a','c']);
  assert.deepEqual(table.map(x=>x.path),['a','c']);
  assert.equal(JSON.stringify(source),original);
  assert.equal(fetched,3);
 }finally{for(const [k,v] of Object.entries(keep)){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
});
test('legacy timers are disabled and station alias support is preserved',()=>{
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const stations=readFileSync(new URL('../station-commutes.js',import.meta.url),'utf8');
 assert.match(ui,/shouldAutoCalculate:\(\)=>false/);
 assert.doesNotMatch(ui,/setInterval\(\(\)=>\{if\(user&&people/);
 assert.match(stations,/normalizedStation/);
 assert.match(ui,/uniquePhotos\(p\)/);
 assert.match(ui,/openPhotoBrowser/);
});
test('table still has complete comparison columns and photo gallery uses dedup',()=>{
 const ui=readFileSync(new URL('../comparison.js',import.meta.url),'utf8');
 assert.match(ui,/const labels=\['House','Price'/);
 assert.match(ui,/uniquePhotos\(p,4\)/);
 assert.match(ui,/Table row error/);
 assert.match(ui,/Viewing status/);
});
