// Preserve source wording. Measurements are taken only from a labelled outdoor section.
const round=n=>Math.round(n*100)/100;
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/[×✕]/g,'x').replace(/(\d)[°º](?=\s*\d)/g,"$1'").trim();
const number=s=>Number(String(s).replace(',','.'));
const metres='(?:m(?:etres?|eters?)?)(?![a-z²2])';
const pair=new RegExp('(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*(?:'+metres+')?\\s*(?:\\([^)]*\\)\\s*)?(?:x|by)\\s*(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*'+metres+'\\b','i');
const feetPair=/(\d{1,3})\s*(?:ft|feet|['’′])\s*(?:(\d{1,2})\s*(?:in(?:ches)?|["”″]))?\s*(?:x|by)\s*(\d{1,3})\s*(?:ft|feet|['’′])\s*(?:(\d{1,2})\s*(?:in(?:ches)?|["”″]))?/i;
const label= /\b((?:(?:front|rear|back|private|enclosed|communal)\s+)?gardens?|driveway|off[ -]?street parking|parking(?:\s+(?:space|area))?|car[ -]?port)\b/i;
const room=/\b(?:bedroom|bathroom|kitchen|reception|dining|living room|ground floor|first floor|garage|conservatory|study|utility|cloakroom|floor area|internal area|external features|storage space)\b/i;
const kindFor=s=>/driveway|parking|car[ -]?port/i.test(s)?'parking':/front/i.test(s)?'front_garden':/rear|back/i.test(s)?'rear_garden':/communal/i.test(s)?'communal_garden':'garden';
function dimensions(text){
 const value=clean(text);
 // Small print sometimes loses the apostrophe separating feet and inches.
 // Bracketed metres remain usable when exactly one feet/inches split agrees.
 const bracketPairs=[...value.matchAll(/(\d{1,3}(?:\s*['’′]\s*\d{0,2}|\s+\d{1,2})?["”″]?)\s*\((\d{1,3}[.,]\d{1,2})\)/g)].filter(m=>{
  const metric=number(m[2]),raw=m[1],choices=[];
  if(/['’′]/.test(raw)){const parts=raw.match(/(\d+)\s*['’′]\s*(\d*)/);if(Number(parts[2]||0)<=11)choices.push((Number(parts[1])+Number(parts[2]||0)/12)*.3048)}
  else{const digits=raw.replace(/\D/g,'');choices.push(Number(digits)*.3048);for(let split=1;split<digits.length;split++){const feet=Number(digits.slice(0,split)),inches=Number(digits.slice(split));if(inches<=11)choices.push((feet+inches/12)*.3048)}}
  return metric>=.5&&metric<=200&&choices.filter(n=>Math.abs(n-metric)<.06).length===1;
 });
 if(bracketPairs.length===2&&/x|by/i.test(value.slice(bracketPairs[0].index+bracketPairs[0][0].length,bracketPairs[1].index))){
  const a=number(bracketPairs[0][2]),b=number(bracketPairs[1][2]);return {width_m:a,length_m:b,area_sqm:round(a*b),dimensions:bracketPairs[0][2].replace(',','.')+' × '+bracketPairs[1][2].replace(',','.')+' m'};
 }
 // Some plans print metres only in brackets beside each imperial side.
 // Require agreement between both units instead of treating any bracketed
 // numbers near a garden as its size.
 const bracketed=/(\d{1,3})\s*['’′]\s*(\d{1,2})?\s*["”″]?\s*\((\d{1,3}[.,]\d{1,2})\)\s*(?:o?m)?\s*x\s*(\d{1,3})\s*['’′]\s*(\d{1,2})?\s*["”″]?\s*\((\d{1,3}[.,]\d{1,2})\)/i.exec(value);
 if(bracketed){
  const a=number(bracketed[3]),b=number(bracketed[6]),fa=(Number(bracketed[1])+Number(bracketed[2]||0)/12)*.3048,fb=(Number(bracketed[4])+Number(bracketed[5]||0)/12)*.3048;
  if(a>=.5&&b>=.5&&a<=200&&b<=200&&Number(bracketed[2]||0)<=11&&Number(bracketed[5]||0)<=11&&Math.abs(a-fa)<.06&&Math.abs(b-fb)<.06)return {width_m:a,length_m:b,area_sqm:round(a*b),dimensions:bracketed[3].replace(',','.')+' × '+bracketed[6].replace(',','.')+' m'};
 }
 const metric=value.match(pair);
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
function singleLength(text){
 const value=clean(text),metric=value.match(/(?:^|[\s(])(\d{1,3}(?:[.,]\d{1,2})?)\s*m(?:etres?)?\b/i);
 if(/\bx\b|\bby\b|\d\s*x\s*\d|[×✕]/i.test(value))return null;
 const bracket=value.match(/(\d{1,3})\s*['’′]\s*(\d{1,2})?\s*["”″]?\s*\((\d{1,3}[.,]\d{1,2})\s*m?\)/i);
 if(bracket){const metres=number(bracket[3]),feet=(Number(bracket[1])+Number(bracket[2]||0)/12)*.3048;if(Number(bracket[2]||0)<=11&&metres>=.5&&metres<=200&&Math.abs(metres-feet)<.06)return {length_m:metres,length_text:bracket[3].replace(',','.')+' m'};return null}
 const imperial=value.match(/(\d{1,3})\s*(?:ft|feet|['’′])\s*(?:(\d{1,2})\s*(?:in(?:ches)?|["”″]))?(?!\d)/i);
 if(!metric&&!imperial)return null;
 const feet=imperial?(Number(imperial[1])+Number(imperial[2]||0)/12)*.3048:null;
 const length=metric?number(metric[1]):round(feet);
 if(length<.5||length>200||Number(imperial?.[2]||0)>11||metric&&feet!=null&&Math.abs(length-feet)>.15)return null;
 return {length_m:length,length_text:metric?metric[1].replace(',','.')+' m':imperial[0].trim()};
}
export function outdoorMeasurements(original){
 const rows=String(original||'').split(/[\r\n]+/).map(clean).filter(Boolean),found=[];
 for(let i=0;i<rows.length;i++){
  const hit=rows[i].match(label);if(!hit)continue;
  // A garden merely mentioned in a room description does not label that room's dimensions.
  if(room.test(rows[i].slice(0,hit.index))||/\b(?:to|onto|access to)\s*$/i.test(rows[i].slice(0,hit.index)))continue;
  const name=hit[1],kind=kindFor(name),following=rows[i].slice(hit.index+hit[0].length),stop=following.search(room),tail=stop<0?following:following.slice(0,stop);
  let section=tail,measurement=dimensions(tail),metric=measurement&&!measurement.converted_from;
  // A printed label, an imperial line and a metric line commonly occupy three lines.
  // Stop at the next room/section; never borrow its measurements.
  if(!measurement||!metric)for(let next=i+1;next<Math.min(rows.length,i+5);next++){
   if(label.test(rows[next])||room.test(rows[next]))break;
   const numericLine=/^(?:[\d\s.,;|<>\[\]=x×'’′"”″():/\-]|o?m\b|ft\b|feet\b|in\b|approx(?:imate(?:ly)?)?\.?\b|by\b|metres?\b|meters?\b)+$/i.test(rows[next]);
   const damagedImperial=/^\d[\d\s.,x'’′"”″sSoOlI|()\-]{1,75}$/i.test(rows[next])&&/['’′]/.test(rows[next])&&/x/i.test(rows[next]);
   if(!numericLine&&!damagedImperial)break;
   section+=' '+rows[next];const d=dimensions(rows[next])||dimensions(section);
   if(d&&(!measurement||!d.converted_from)){measurement=d;metric=!d.converted_from;if(metric)break}
  }
  const item={kind,label:name,...measurement,...(!measurement?singleLength(section):{})};
  if(!found.some(p=>p.kind===kind&&p.label.toLowerCase()===name.toLowerCase()&&p.area_sqm===item.area_sqm&&p.width_m===item.width_m&&p.length_m===item.length_m))found.push(item);
 }
 return found;
}
export function mainGardenArea(items){
 const sizes=items.filter(x=>['garden','rear_garden','front_garden'].includes(x.kind)&&x.area_sqm!=null&&Number.isFinite(Number(x.area_sqm))).map(x=>Number(x.area_sqm));
 return sizes.length?Math.max(...sizes):null;
}
export function retainOutdoorMeasurements(fresh,known=[]){
 const key=x=>x.kind+':'+String(x.label||'').toLowerCase();
 const near=(a,b)=>Math.abs(Number(a)-Number(b))<.03;
 const measured=x=>!!(x.dimensions||x.length_text);
 const sameSize=(a,b)=>key(a)===key(b)&&(a.length_text&&b.length_text?near(a.length_m,b.length_m):near(a.width_m,b.width_m)&&near(a.length_m,b.length_m)||near(a.width_m,b.length_m)&&near(a.length_m,b.width_m));
 return [...fresh.filter(x=>measured(x)||!known.some(p=>key(p)===key(x)&&measured(p))),...known.filter(p=>measured(p)?!fresh.some(x=>measured(x)&&sameSize(x,p)):!fresh.some(x=>key(x)===key(p)))];
}
export function plainListingText(raw){
 return String(raw||'').replace(/<\s*(?:br\b[^>]*|\/(?:p|div|li|h[1-6]))\s*>/gi,'\n').replace(/<[^>]*>/g,' ')
  .replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);|&apos;/gi,"'")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').trim();
}
const relevant=/\b(?:gardens?|driveways?|parking|garages?|car[ -]?ports?|off[ -]?street|on[ -]?street|residents?['’]? permits?|patios?|courtyards?|lawns?|side access)\b/i;
const sectionEnd=/^(?:bedroom|bathroom|kitchen|reception|dining|living|hallway|landing|tenure|council tax|epc|location|transport|schools|disclaimer|brochure|stamp duty|mortgage|about the agent|marketed by)\b/i;
const indoor=/\b(?:bedrooms?|bathrooms?|WC|reception|accommodation|family home|terraced house|detached house|freehold house|fitted kitchen|entrance hall|EPC|energy rating|council tax)\b/i;
function outdoorExcerpt(sentence,inSection=false){
 let value=sentence.trim();
 if(!relevant.test(value)&&!inSection)return '';
 // Keep factual outdoor clauses, without the description of rooms, the house,
 // transport or a generic sales pitch which happens to surround "garden".
 value=value.replace(/,?\s*(?:creating a (?:pleasant|natural|seamless) connection|providing an ideal space|offering an ideal space|perfect for (?:family|entertaining|relaxing)|ideal for (?:family|entertaining|relaxing))\b.*$/i,'');
 value=value.replace(/\s+complete(?:s)? the ground floor\.?$/i,'');
 value=value.replace(/\b(?:EPC|energy)\s*rating\s*:?\s*[A-G]\b.*$/i,'');
 const clauses=value.split(/\s*[,;]\s*(?!\d)/),kept=[];let context=inSection;
 for(let clause of clauses){
  const hit=clause.match(relevant);
  if(hit){
   const prefix=clause.slice(0,hit.index);
   if(indoor.test(prefix)||/^(?:the property|this property|externally|outside|benefit)/i.test(prefix)){
    const boundary=[...prefix.matchAll(/\b(?:with|onto|to|from|boasts?|offers?|featuring|including)\s+/gi)].at(-1);
    if(boundary)clause=clause.slice(boundary.index+boundary[0].length);
    else clause=(prefix.match(/(?:(?:front|rear|back|private|enclosed|communal|large|substantial|south[ -]?facing|north[ -]?facing)\s+)+$/i)?.[0]||'')+clause.slice(hit.index);
   }
   clause=clause.replace(/^(?:and\s+)?(?:externally|outside)\s*[:,-]?\s*/i,'').replace(/^(?:the\s+)?property\s+(?:benefits?\s+from|has|offers?)\s+/i,'');
   kept.push(clause);context=true;
  }else if(context&&!indoor.test(clause)&&!/\b(?:transport|schools?|amenities|station|well.proportioned|well.presented|attractive|charming|popular residential)\b/i.test(clause))kept.push(clause);
 }
 const result=kept.join(', ').replace(/^[,;\s]+|[,;\s]+$/g,'').trim();
 return /^(?:the|a|an)\s+garden[.!]?$/i.test(result)?'':result;
}
export function listingOutdoorDetails(raw){
 const text=plainListingText(raw),notes=[];let outdoorSection=false;
 const add=value=>{value=value.trim();const key=value.toLowerCase().replace(/[^a-z0-9]/g,'');if(key&&!notes.some(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===key))notes.push(value)};
 for(const row of text.split('\n')){
  if(!row.trim()){outdoorSection=false;continue}
  if(sectionEnd.test(row))outdoorSection=false;
  if(/^(?:(?:front|rear|back|private|enclosed|communal)\s+)?(?:gardens?|driveway|parking|garage|outside|exterior)\s*[:.]?$/i.test(row))outdoorSection=true;
  for(const sentence of row.split(/(?<=[.!?])\s+(?=[A-Z“"'])/)){
   const excerpt=outdoorExcerpt(sentence,outdoorSection);if(excerpt)add(excerpt);
  }
 }
 const measurements=outdoorMeasurements(text),area=mainGardenArea(measurements);
 // Explicit square-metre areas remain useful when sides are not published.
 const explicit=text.match(/\b(?:(?:rear|back|private)\s+)?garden\s*(?:area|size|measuring|measures|approximately|approx\.?|of|:)?\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|sqm|sq\.?\s*m|square metres?)\b/i);
 return {notes,measurements,garden_area_sqm:area??(explicit?number(explicit[1]):null),garden_description:notes.join('\n')};
}
export function combineOutdoorDescription(listingText,planItems=[]){
 const notes=listingOutdoorDetails(listingText).notes;
 for(const item of planItems){
  if(item.length_text&&planItems.some(x=>x.dimensions&&x.kind===item.kind&&x.label.toLowerCase()===item.label.toLowerCase()&&(Math.abs(x.length_m-item.length_m)<.03||Math.abs(x.width_m-item.length_m)<.03)))continue;
  if(!item.dimensions&&!item.length_text&&planItems.some(x=>x.kind===item.kind&&x.label.toLowerCase()===item.label.toLowerCase()&&(x.dimensions||x.length_text)))continue;
  const name=item.kind==='front_garden'?'Front garden':item.kind==='rear_garden'?'Rear garden':item.kind==='communal_garden'?'Communal garden':item.kind==='parking'?item.label:'Garden';
  notes.push(item.dimensions?name+' (floor plan): '+item.dimensions+'; approximately '+item.area_sqm+' m².':item.length_text?name+' (floor plan): length '+item.length_text+'; width not stated.':name+' shown on the floor plan.');
 }
 return [...new Set(notes)].join('\n');
}
export function normalizeListingOutdoors(data){
 const raw=data.listing_text||data.garden_description||'',outdoors=listingOutdoorDetails(raw);
 return {...data,listing_text:data.listing_text||null,garden_description:outdoors.garden_description,garden_area_sqm:outdoors.garden_area_sqm??data.garden_area_sqm??null};
}
