import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {photoDigest} from '../photo-dedup.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('async function storageCompatibleImage('),html.indexOf('/* Read only counts explicitly'));
function setup(fail=''){
 const blobs=new Map(),samples={one:'a'.repeat(1500),duplicate:'a'.repeat(1500),two:'b'.repeat(1500),three:'c'.repeat(1500),four:'d'.repeat(1500)};
 const extension=async(_,args)=>{if(args.url===fail)throw Error('network failure');return {mime:'image/jpeg',base64:Buffer.from(samples[args.url]).toString('base64')}};
 const sb={storage:{from:()=>({upload:async(path,blob)=>(blobs.set(path,blob),{error:null}),download:async path=>({data:blobs.get(path),error:null})})}};
 const blob64=(data,mime)=>new Blob([Buffer.from(data,'base64')],{type:mime});
 const archive=new Function('extension','sb','report','crypto','photoDigest','blob64','inspectFloorplanImage',source+';return archive;')(extension,sb,()=>{},globalThis.crypto,photoDigest,blob64,async()=>({accepted:true}));
 return {archive,blobs};
}
test('archives all distinct source photos in order and reads stored bytes back',async()=>{
 const {archive,blobs}=setup();const images=await archive(['one','duplicate','two','three','four'],'id','photo');
 const contents=await Promise.all(images.map(async x=>await blobs.get(x.path).text()));
 assert.deepEqual(contents.map(x=>x[0]),['a','b','c','d']);
});
test('failed source photo aborts the photo archive instead of silently losing it',async()=>{
 const {archive}=setup('two');await assert.rejects(archive(['one','two'],'id','photo'),/Could not save all listing photographs/);
});
test('GIF plans are converted to PNG before storage',async()=>{
 let closed=false,drawn=false;
 const convert=new Function('createImageBitmap','document',source+';return storageCompatibleImage;')(
  async()=>({width:30,height:40,close(){closed=true}}),
  {createElement:()=>({getContext:()=>({drawImage(){drawn=true}}),toBlob:cb=>cb(new Blob(['png'],{type:'image/png'}))})}
 );
 const result=await convert(new Blob(['gif'],{type:'image/gif'}));
 assert.equal(result.type,'image/png');assert.equal(drawn,true);assert.equal(closed,true);
});
