// One non-destructive gallery for Table, Details and full-screen photographs.
// Preserve original Supabase data and order. Cache image fingerprints across views.
export function createUniquePhotoStore(photo) {
 const perImage=new Map(), perProperty=new Map();
 const signature=p=>(p.images||[]).map(x=>x.path||x.url||'').join('|');
 async function fingerprint(item){
  const key=item.path||item.url||'';
  if(!key)return null;
  if(!perImage.has(key))perImage.set(key,(async()=>{
   try{
    const url=await photo(item);
    if(!url)return null;
    const response=await fetch(url,{mode:'cors'});
    if(!response.ok)throw Error('Image HTTP '+response.status);
    const bitmap=await createImageBitmap(await response.blob());
    try{
     const canvas=document.createElement('canvas');canvas.width=17;canvas.height=16;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     if(!ctx)return null;
     ctx.drawImage(bitmap,0,0,17,16);
     const pixels=ctx.getImageData(0,0,17,16).data;
     const pixel=(x,y)=>{const off=(y*17+x)*4;return Math.round(pixels[off]*.299+pixels[off+1]*.587+pixels[off+2]*.114)};
     let hash='';
     for(let y=0;y<16;y++)for(let x=0;x<16;x++)hash+=pixel(x,y)>=pixel(x+1,y)?'1':'0';
     // A second hash of the central crop catches re-encoded and lightly cropped versions.
     const side=Math.min(bitmap.width,bitmap.height)*0.82;
     const left=(bitmap.width-side)/2,top=(bitmap.height-side)/2;
     ctx.clearRect(0,0,17,16);
     ctx.drawImage(bitmap,left,top,side,side,0,0,17,16);
     const center=ctx.getImageData(0,0,17,16).data;
     const luminance=(x,y)=>{const o=(y*17+x)*4;return Math.round(center[o]*.299+center[o+1]*.587+center[o+2]*.114)};
     let cropHash='';
     for(let y=0;y<16;y++)for(let x=0;x<16;x++)cropHash+=luminance(x,y)>=luminance(x+1,y)?'1':'0';
     return {full:hash,center:cropHash};
    }finally{bitmap.close()}
   }catch(e){console.warn('Cannot fingerprint photo; keeping original',key,String(e));return null}
  })());
  return perImage.get(key);
 }
 function distance(a,b){
  if(!a||!b||a.length!==b.length)return Infinity;
  let diff=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])diff++;
  return diff;
 }
 // Incremental: Table needs only first 4 distinct photos, Details needs the full gallery.
 async function unique(p,limit=Infinity){
  const key=p.id+':'+signature(p);
  if(!perProperty.has(key))perProperty.set(key,{seen:[],cursor:0,items:[],paths:new Set(),chain:Promise.resolve()});
  const state=perProperty.get(key);
  const compute=async()=>{
   const items=p.images||[];
   while(state.cursor<items.length&&state.items.length<limit){
    const item=items[state.cursor++],path=item.path||item.url||'';
    if(!path||state.paths.has(path))continue;
    state.paths.add(path);
    const hash=await fingerprint(item);
    if(hash&&state.seen.some(old=>old&&(distance(hash.full,old.full)<=24||distance(hash.center,old.center)<=20)))continue;
    state.seen.push(hash);
    state.items.push(item);
   }
   return state.items.slice(0,limit);
  };
  // Serialize simultaneous Table/Details requests so they cannot cause duplicate entries.
  state.chain=state.chain.then(compute,compute);
  return state.chain;
 }
 return {unique};
}
