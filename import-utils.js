export function canonicalListing(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:')throw Error('Paste a Zoopla or Rightmove link');
 const host=u.hostname.replace(/^www\./,'').toLowerCase();
 const match=host==='zoopla.co.uk'?u.pathname.match(/^\/(?:for-sale|to-rent)\/details\/(\d+)(?:\/|$)/):host==='rightmove.co.uk'?u.pathname.match(/^\/properties\/(\d+)(?:\/|$)/):null;
 if(!match)throw Error('Paste an individual Zoopla or Rightmove listing');
 return host==='zoopla.co.uk'?`https://www.zoopla.co.uk/for-sale/details/${match[1]}`:`https://www.rightmove.co.uk/properties/${match[1]}`;
}
const empty=v=>v==null||v==='';
export function importChanges(property,incoming){
 const previous=property.import_diagnostics?.source_values||{},overrides=property.manual_overrides||{},changes={};
 for(const [field,value] of Object.entries(incoming)){
  if(empty(value)||overrides[field])continue;
  const current=property[field],hasPrior=Object.hasOwn(previous,field);
  if(empty(current)||(hasPrior&&String(current)===String(previous[field])))if(String(current??'')!==String(value))changes[field]=value;
 }
 return changes;
}
export function validateGeocode(address,place){
 const number=String(address||'').match(/^\s*(\d+[a-z]?)\b/i)?.[1];
 const found=place?.address?.house_number;
 if(!number||!found||number.toLowerCase()!==String(found).toLowerCase())return false;
 const road=String(place.address.road||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const wanted=String(address).replace(/^\s*\d+[a-z]?\s*/i,'').split(',')[0].toLowerCase().replace(/[^a-z0-9]/g,'');
 const norm=s=>s.replace(/road$/,'rd').replace(/street$/,'st').replace(/avenue$/,'ave');
 return !!road&&!!wanted&&norm(road)===norm(wanted);
}
