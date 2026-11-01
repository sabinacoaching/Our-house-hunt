// One-time migration of legacy media. Old storage objects remain intact.
export const mediaRevision='source-gallery-20261031';
export async function reconcileOne({sb,property,read,archive}){
 const initial=await sb.from('properties').select('*').eq('id',property.id).single();
 if(initial.error||!initial.data)throw initial.error||Error('House not found');
 const before=initial.data;
 if(before.import_diagnostics?.media_source_revision===mediaRevision)return {status:'already-done'};
 let incoming;
 try{incoming=await read(before.url)}catch(e){
  if(!/original listing is unavailable or redirected/i.test(String(e?.message||e)))throw e;
  const diagnostics={...(before.import_diagnostics||{}),media_source_revision:mediaRevision,media_source_result:'listing-unavailable'};
  const mark=await sb.from('properties').update({import_diagnostics:diagnostics}).eq('id',before.id).eq('import_diagnostics',JSON.stringify(before.import_diagnostics||{})).select('id');
  if(mark.error)throw mark.error;
  return {status:'listing-unavailable'};
 }
 if(!incoming.images?.length)throw Error('Original gallery is empty');
 const fresh=await sb.from('properties').select('*').eq('id',before.id).single();
 if(fresh.error||!fresh.data)throw fresh.error||Error('House not found');
 const p=fresh.data,overrides=p.manual_overrides||{};
 const newImages=overrides.images?null:await archive(incoming.images,p.id,'photo');
 let newPlans=null;
 if(!overrides.floorplans&&!p.import_diagnostics?.manual_floorplan_saved_at&&incoming.floorplans?.length){
  newPlans=await archive(incoming.floorplans,p.id,'source-plan',Infinity,[],true);
  if(!newPlans.length)newPlans=null;
 }
 const update={import_diagnostics:{...(p.import_diagnostics||{}),media_source_revision:mediaRevision,media_source_result:'completed'}};
 if(newImages?.length)update.images=newImages;
 if(newPlans?.length)update.floorplans=newPlans;
 let request=sb.from('properties').update(update).eq('id',p.id).eq('manual_overrides',JSON.stringify(overrides)).eq('import_diagnostics',JSON.stringify(p.import_diagnostics||{}));
 if(newImages)request=request.eq('images',JSON.stringify(p.images||[]));
 if(newPlans)request=request.eq('floorplans',JSON.stringify(p.floorplans||[]));
 const saved=await request.select('id');
 if(saved.error)throw saved.error;
 if(!saved.data?.length)return {status:'changed-during-repair'};
 return {status:'saved',photos:newImages?.length||0,plans:newPlans?.length||0};
}
