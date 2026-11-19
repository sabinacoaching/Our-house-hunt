// Queue only listing URLs on this browser. Saved houses and route state remain in Supabase.
export function createImportQueue({storage,key,run,notify=()=>{},locks,makeId=()=>crypto.randomUUID()}){
 let pumping=false;
 const read=()=>{const raw=storage.getItem(key);if(!raw)return [];const items=JSON.parse(raw);if(!Array.isArray(items))throw Error('Import queue could not be read');return items};
 const write=items=>{storage.setItem(key,JSON.stringify(items));notify(items)};
 const change=async fn=>{
  const act=()=>{const items=read(),before=JSON.stringify(items),result=fn(items);if(JSON.stringify(items)!==before)write(items);return result};
  return locks?locks.request(key+':write',act):act();
 };
 async function enqueue(url){
  const result=await change(items=>{const found=items.find(x=>x.url===url);if(found)return {duplicate:true,item:found};const item={id:makeId(),url,status:'pending'};items.push(item);return {duplicate:false,item}});
  void pump();return result;
 }
 async function retry(id){await change(items=>{const item=items.find(x=>x.id===id);if(item?.status==='failed'){item.status='pending';delete item.error}});void pump()}
 async function remove(id){await change(items=>{const i=items.findIndex(x=>x.id===id&&x.status!=='running');if(i>=0)items.splice(i,1)})}
 async function drain(){
  // The owner of the run lock is the only worker. An interrupted job can be
  // safely retried: importHouse checks the canonical URL before creating a row.
  await change(items=>{for(const item of items)if(item.status==='running')item.status='pending'});
  for(;;){
   const item=await change(items=>{const next=items.find(x=>x.status==='pending');if(next)next.status='running';return next?{...next}:null});
   if(!item)break;
   try{
    await run(item.url);
    await change(items=>{const i=items.findIndex(x=>x.id===item.id);if(i>=0)items.splice(i,1)});
   }catch(error){
    await change(items=>{const current=items.find(x=>x.id===item.id);if(current){current.status='failed';current.error=String(error?.message||error).slice(0,400)}});
   }
  }
 }
 async function pump(){
  if(pumping)return;pumping=true;let worked=false;
  try{if(locks)await locks.request(key+':worker',{ifAvailable:true},async lock=>{if(lock){worked=true;await drain()}});else{worked=true;await drain()}}
  catch(error){notify(null,error)}finally{pumping=false;if(worked)try{if(read().some(x=>x.status==='pending'))queueMicrotask(()=>void pump())}catch(error){notify(null,error)}}
 }
 return {enqueue,retry,remove,pump,read};
}
