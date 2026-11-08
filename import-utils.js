export function canonicalListing(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:')throw Error('Paste a Zoopla or Rightmove link');
 const host=u.hostname.replace(/^www\./,'').toLowerCase();
 const match=host==='zoopla.co.uk'?u.pathname.match(/^\/(?:for-sale|to-rent)\/details\/(\d+)(?:\/|$)/):host==='rightmove.co.uk'?u.pathname.match(/^\/properties\/(\d+)(?:\/|$)/):null;
 if(!match)throw Error('Paste an individual Zoopla or Rightmove listing');
 return host==='zoopla.co.uk'?`https://www.zoopla.co.uk/for-sale/details/${match[1]}`:`https://www.rightmove.co.uk/properties/${match[1]}`;
}
const empty=v=>v==null||v==='';
const normalizedRoad=value=>String(value||'').replace(/^\s*\d+[a-z]?\s+/i,'').split(',')[0].toLowerCase().replace(/\b(rd|road)\b/g,'road').replace(/\b(st|street)\b/g,'street').replace(/\b(ave|avenue)\b/g,'avenue').replace(/[^a-z0-9]/g,'');
export function validStreetViewHint(hint,address){
 if(hint?.source!=='listing-street-view'||!/^\s*\d+[a-z]?\s+/i.test(hint.address||''))return false;
 const lat=Number(hint.latitude),lon=Number(hint.longitude);
 if(hint.latitude==null||hint.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<=49||lat>=61||lon<=-9||lon>=3)return false;
 const road=normalizedRoad(address),hintRoad=normalizedRoad(hint.address);
 return !!road&&road===hintRoad;
}
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
 if(!road||!wanted||norm(road)!==norm(wanted))return false;
 // A full postcode, if supplied, must refer to the same building. Never
 // substitute another town's identically numbered street.
 const postcode=String(address).match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
 const foundPostcode=place.address.postcode;
 if(postcode&&(!foundPostcode||postcode.replace(/\s/g,'').toUpperCase()!==String(foundPostcode).replace(/\s/g,'').toUpperCase()))return false;
 const locality=String(address).split(',')[1]?.trim().replace(/\s+[A-Z]{1,2}\d[A-Z\d]?(?:\s+\d[A-Z]{2})?$/i,'').trim();
 if(locality&&place.display_name&&!String(place.display_name).toLowerCase().includes(locality.toLowerCase()))return false;
 return true;
}
