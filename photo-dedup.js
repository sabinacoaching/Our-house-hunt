// Keep listing order. Only identical bytes or an identical stored reference are
// treated as duplicates; visually similar rooms must remain distinct.
export async function photoDigest(blob) {
 const bytes=await blob.arrayBuffer();
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}

export function createUniquePhotoStore(photo) {
 const perImage=new Map(),perProperty=new Map();
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
    return await photoDigest(await response.blob());
   }catch(e){console.warn('Cannot compare photo; keeping original',key,String(e));return null}
  })());
  return perImage.get(key);
 }
 async function unique(p,limit=Infinity){
  const key=p.id+':'+signature(p);
  if(!perProperty.has(key))perProperty.set(key,{hashes:new Set(),cursor:0,items:[],paths:new Set(),chain:Promise.resolve()});
  const state=perProperty.get(key);
  const compute=async()=>{
   const items=p.images||[];
   while(state.cursor<items.length&&state.items.length<limit){
    const item=items[state.cursor++],path=item.path||item.url||'';
    if(!path||state.paths.has(path))continue;
    state.paths.add(path);
    const hash=await fingerprint(item);
    if(hash&&state.hashes.has(hash))continue;
    if(hash)state.hashes.add(hash);
    state.items.push(item);
   }
   return state.items.slice(0,limit);
  };
  state.chain=state.chain.then(compute,compute);
  return state.chain;
 }
 return {unique};
}
