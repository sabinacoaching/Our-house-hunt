// Preserve source wording. Measurements are taken only from a labelled outdoor section.
const round=n=>Math.round(n*100)/100;
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[×✕]/g,'x').trim();
const number=s=>Number(String(s).replace(',','.'));
const metres='(?:m(?:etres?|eters?)?)(?![a-z²2])';
const pair=new RegExp('(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*(?:'+metres+')?\\s*(?:x|by)\\s*(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*'+metres+'\\b','i');
const feetPair=/(\d{1,3})\s*(?:ft|feet|['’′])\s*(?:(\d{1,2})\s*(?:in(?:ches)?|["”″]))?\s*(?:x|by)\s*(\d{1,3})\s*(?:ft|feet|['’′])\s*(?:(\d{1,2})\s*(?:in(?:ches)?|["”″]))?/i;
const label= /\b((?:(?:front|rear|back|private|enclosed|communal)\s+)?gardens?|driveway|off[ -]?street parking|parking(?:\s+(?:space|area))?|car[ -]?port)\b/i;
const room=/\b(?:bedroom|bathroom|kitchen|reception|dining|living room|ground floor|first floor|garage|floor area|internal area|external features|storage space)\b/i;
const kindFor=s=>/driveway|parking|car[ -]?port/i.test(s)?'parking':/front/i.test(s)?'front_garden':/rear|back/i.test(s)?'rear_garden':/communal/i.test(s)?'communal_garden':'garden';
function dimensions(text){
 const value=clean(text),metric=value.match(pair);
 if(metric){
  const a=number(metric[1]),b=number(metric[2]);
  if(a>=.5&&a<=200&&b>=.5&&b<=200&&a*b<=10000)return {width_m:a,length_m:b,area_sqm:round(a*b),dimensions:metric[1].replace(',','.')+' × '+metric[2].replace(',','.')+' m'};
 }
 const feet=value.match(feetPair);
 if(feet){
  const a=Number(feet[1])+Number(feet[2]||0)/12,b=Number(feet[3])+Number(feet[4]||0)/12;
  if(Number(feet[2]||0)>11||Number(feet[4]||0)>11||a<=1||b<=1||a>650||b>650)return null;
  return {width_m:round(a*.3048),length_m:round(b*.3048),area_sqm:round(a*b*.09290304),dimensions:feet[0].replace(/\s+/g,' '),converted_from:'feet'};
 }
 return null;
}
export function outdoorMeasurements(original){
 const rows=String(original||'').split(/[\r\n]+/).map(clean).filter(Boolean),found=[];
 for(let i=0;i<rows.length;i++){
  const hit=rows[i].match(label);if(!hit)continue;
  // A garden merely mentioned in a room description does not label that room's dimensions.
  if(room.test(rows[i].slice(0,hit.index)))continue;
  const name=hit[1],kind=kindFor(name),following=rows[i].slice(hit.index+hit[0].length),stop=following.search(room),tail=stop<0?following:following.slice(0,stop);
  let section=tail,measurement=dimensions(tail),metric=measurement&&!measurement.converted_from;
  // A printed label, an imperial line and a metric line commonly occupy three lines.
  // Stop at the next room/section; never borrow its measurements.
  if(!measurement||!metric)for(let next=i+1;next<Math.min(rows.length,i+5);next++){
   if(label.test(rows[next])||room.test(rows[next]))break;
   if(!/^(?:[\d\s.,x×'’′"”″():/\-]|m\b|ft\b|feet\b|in\b|approx(?:imate(?:ly)?)?\.?\b|by\b|metres?\b|meters?\b)+$/i.test(rows[next]))break;
   section+=' '+rows[next];const d=dimensions(rows[next])||dimensions(section);
   if(d&&(!measurement||!d.converted_from)){measurement=d;metric=!d.converted_from;if(metric)break}
  }
  const item={kind,label:name,...measurement};
  if(!found.some(p=>p.kind===kind&&p.label.toLowerCase()===name.toLowerCase()&&p.area_sqm===item.area_sqm))found.push(item);
 }
 return found;
}
export function mainGardenArea(items){
 const rear=items.filter(x=>x.kind==='rear_garden'&&x.area_sqm!=null),generic=items.filter(x=>x.kind==='garden'&&x.area_sqm!=null);
 const choices=rear.length?rear:generic;
 return choices.length===1?choices[0].area_sqm:null;
}
export function plainListingText(raw){
 return String(raw||'').replace(/<\s*(?:br\b[^>]*|\/(?:p|div|li|h[1-6]))\s*>/gi,'\n').replace(/<[^>]*>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);|&apos;/gi,"'")
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
}
const relevant=/\b(?:gardens?|driveways?|parking|garages?|car[ -]?ports?|off[ -]?street|on[ -]?street|residents?['’]? permits?|patios?|courtyards?|lawns?|side access)\b/i;
const sectionEnd=/^(?:bedroom|bathroom|kitchen|reception|dining|living|hallway|landing|tenure|council tax|epc|location|transport|schools|disclaimer|brochure|stamp duty|mortgage|about the agent|marketed by)\b/i;
export function listingOutdoorDetails(raw){
 const text=plainListingText(raw),notes=[];let outdoorSection=false;
 const add=value=>{value=value.trim();const key=value.toLowerCase().replace(/[^a-z0-9]/g,'');if(key&&!notes.some(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===key))notes.push(value)};
 for(const row of text.split('\n')){
  if(!row.trim()){outdoorSection=false;continue}
  if(sectionEnd.test(row))outdoorSection=false;
  if(/^(?:(?:front|rear|back|private|enclosed|communal)\s+)?(?:gardens?|driveway|parking|garage|outside|exterior)\s*[:.]?$/i.test(row))outdoorSection=true;
  for(const sentence of row.split(/(?<=[.!?])\s+(?=[A-Z“"'])/))if(relevant.test(sentence)||outdoorSection)add(sentence);
 }
 const measurements=outdoorMeasurements(text),area=mainGardenArea(measurements);
 // Explicit square-metre areas remain useful when sides are not published.
 const explicit=text.match(/\b(?:(?:rear|back|private)\s+)?garden\s*(?:area|size|measuring|measures|approximately|approx\.?|of|:)?\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|sqm|sq\.?\s*m|square metres?)\b/i);
 return {notes,measurements,garden_area_sqm:area??(explicit?number(explicit[1]):null),garden_description:notes.join('\n')};
}
export function combineOutdoorDescription(listingText,planItems=[]){
 const notes=listingOutdoorDetails(listingText).notes;
 for(const item of planItems){
  const name=item.kind==='front_garden'?'Front garden':item.kind==='rear_garden'?'Rear garden':item.kind==='communal_garden'?'Communal garden':item.kind==='parking'?item.label:'Garden';
  notes.push(item.dimensions?name+' (floor plan): '+item.dimensions+'; approximately '+item.area_sqm+' m².':name+' shown on the floor plan.');
 }
 return [...new Set(notes)].join('\n');
}
export function normalizeListingOutdoors(data){
 const raw=data.listing_text||data.garden_description||'',outdoors=listingOutdoorDetails(raw);
 return {...data,listing_text:data.listing_text||null,garden_description:outdoors.garden_description||data.garden_description||'',garden_area_sqm:outdoors.garden_area_sqm??data.garden_area_sqm??null};
}
