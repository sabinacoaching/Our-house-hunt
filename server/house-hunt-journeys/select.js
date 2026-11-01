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
