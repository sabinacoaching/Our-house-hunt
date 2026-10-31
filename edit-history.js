// Last 20 manual edits are stored locally. Undo never reverses an automated import.
export function createEditHistory({sb,onRestored}){
 const key='house-hunt:edit-history:v1',watchers=new Set();
 let stack=[];try{const v=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(v))stack=v.slice(-20)}catch{}
 const canonical=v=>{
  if(v==null)return null;
  if(Array.isArray(v))return v.map(canonical);
  if(typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
 };
 const eq=(a,b)=>{
  if(a==null&&b==null)return true;
  if(typeof a==='number'&&typeof b==='string'&&b.trim()!==''&&Number.isFinite(Number(b)))return a===Number(b);
  if(typeof b==='number'&&typeof a==='string'&&a.trim()!==''&&Number.isFinite(Number(a)))return b===Number(a);
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 };
 const clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
 const notify=()=>{for(const fn of watchers)fn(stack.length)};
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(stack.slice(-20)))}catch{}notify()};
 async function save(p,changes){
  if(!p?.id)return {error:new Error('Property not selected')};
  const before={},after={};
  for(const [k,v] of Object.entries(changes||{})){
   if(eq(p[k],v))continue;
   before[k]=clone(p[k]);after[k]=clone(v);
  }
  if(!Object.keys(after).length)return {error:null,unchanged:true};
  const r=await sb.from('properties').update(after).eq('id',p.id);
  if(r.error)return r;
  Object.assign(p,after);
  stack.push({id:p.id,address:p.address||'',before,after,at:new Date().toISOString()});
  stack=stack.slice(-20);persist();return {error:null};
 }
 function recordOrder(before,after){
  if(JSON.stringify(before)===JSON.stringify(after))return;
  stack.push({kind:'reorder',before,after,at:new Date().toISOString()});
  stack=stack.slice(-20);persist();
 }
 async function undo(){
  if(!stack.length)return {error:new Error('No edit to undo')};
  const last=stack.at(-1);
  if(last.kind==='reorder'){
   const r=await sb.from('properties').select('id,sort_order').in('id',last.after);
   if(r.error)return r;
   const current=(r.data||[]).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)).map(x=>x.id);
   if(JSON.stringify(current)!==JSON.stringify(last.after))
    return {error:new Error('Another user has rearranged the houses. Undo did not overwrite that order.')};
   const saved=await sb.rpc('house_hunt_reorder',{house_ids:last.before});
   if(saved.error)return saved;
   stack.pop();persist();await onRestored?.(last);return {error:null,entry:last};
  }
  const r=await sb.from('properties').select('*').eq('id',last.id).single();
  if(r.error)return r;
  for(const [k,v] of Object.entries(last.after))if(!eq(r.data?.[k],v))
   return {error:new Error('This value was changed again. Undo stopped to protect the newer edit.')};
  const result=await sb.from('properties').update(last.before).eq('id',last.id);
  if(result.error)return result;
  stack.pop();persist();await onRestored?.(last);return {error:null,entry:last};
 }
 return {save,undo,recordOrder,subscribe(fn){watchers.add(fn);fn(stack.length);return()=>watchers.delete(fn)},canUndo:()=>stack.length>0};
}