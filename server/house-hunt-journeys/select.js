const normal=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function matchesOrigin(address,point){
 const m=String(address||'').match(/^\s*(\d+[a-z]?)\s+([^,]+)/i);
 if(!m)return false;
 const expected=normal(m[1]+' '+m[2]),found=normal(point?.commonName);
 return found===expected||found.startsWith(expected+' ');
}
export function matchesDestination(id,point){
 const name=normal(point?.commonName);
 if(id==='waterloo')return /\bWATERLOO\b/.test(name);
 if(id==='dilly')return /^21 PICCADILLY\b/.test(name);
 if(id==='dancelab')return /^63 UPPER RICHMOND ROAD\b/.test(name);
 return false;
}
// The browser can supply an independently geocoded building, but only when
// the saved proof still describes the current address and current coordinates.
export function verifiedLocation(p){
 const hint=p?.import_diagnostics?.source_location;
 if(hint?.source==='listing-street-view'&&hint.listing_url===p.url&&hint.address_input===p.address&&hint.latitude!=null&&hint.longitude!=null&&p.latitude!=null&&p.longitude!=null){
  const lat=Number(hint.latitude),lon=Number(hint.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>49&&lat<61&&lon> -9&&lon<3&&Math.abs(lat-Number(p.latitude))<1e-7&&Math.abs(lon-Number(p.longitude))<1e-7)return {lat,lon};
 }
 const v=p?.import_diagnostics?.geocode_verified;
 if(v?.source!=='nominatim'||v.address_input!==p.address||v.house_number==null||!v.road)return null;
 const input=String(p.address||'').replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/ig,'').trim();
 if(!matchesOrigin(input,{commonName:String(v.house_number)+' '+String(v.road)}))return null;
 const postcode=String(p.address||'').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
 if(postcode&&postcode.replace(/\s/g,'').toUpperCase()!==String(v.postcode||'').replace(/\s/g,'').toUpperCase())return null;
 const lat=Number(v.latitude),lon=Number(v.longitude);
 if(v.latitude==null||v.longitude==null||p.latitude==null||p.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<49||lat>61||lon< -9||lon>3||Math.abs(lat-Number(p.latitude))>1e-7||Math.abs(lon-Number(p.longitude))>1e-7)return null;
 return {lat,lon};
}
export function nearLocation(point,origin){
 if(point?.lat==null||point?.lon==null||!Number.isFinite(Number(point.lat))||!Number.isFinite(Number(point.lon)))return false;
 const dy=(Number(point.lat)-origin.lat)*111195,dx=(Number(point.lon)-origin.lon)*111195*Math.cos(origin.lat*Math.PI/180);
 return Math.hypot(dx,dy)<=100;
}
// TfL normally returns London wall times without an offset. Explicit offsets
// are converted to London wall time before comparing the arrival deadline.
function londonWallTime(value){
 if(typeof value!=='string')return NaN;
 if(!/(?:Z|[+-]\d\d:\d\d)$/.test(value))return Date.parse(value+'Z');
 const ms=Date.parse(value);if(!Number.isFinite(ms))return NaN;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
}
export function selectJourney(journeys,target){
 const valid=(journeys||[]).map(j=>{
  const arrival=londonWallTime(j.arrivalDateTime),departure=londonWallTime(j.startDateTime);
  const duration=Number(j.duration),elapsed=(arrival-departure)/60000;
  return {j,arrival,departure,duration,elapsed};
 }).filter(x=>Number.isFinite(x.arrival)&&Number.isFinite(x.departure)&&
  x.arrival<=target&&x.duration>0&&x.elapsed>0&&Math.abs(x.elapsed-x.duration)<=1&&
  (x.j.legs||[]).some(l=>l.mode?.id&&!['walking','cycle'].includes(l.mode.id)));
 if(!valid.length)return null;
 const window=valid.filter(x=>target-x.arrival<=5*60000);
 const candidates=window.length?window:valid;
 candidates.sort(window.length
  ?(a,b)=>a.duration-b.duration||b.arrival-a.arrival
  :(a,b)=>b.arrival-a.arrival||a.duration-b.duration);
 return candidates[0].j;
}
