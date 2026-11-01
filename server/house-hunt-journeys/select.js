// Times supplied by the caller must refer to the same time zone and date.
export function selectJourney(journeys,target){
 const tflTime=s=>Date.parse(typeof s==='string'&&!/(?:Z|[+-]\d\d:\d\d)$/.test(s)?s+'Z':s);
 const valid=(journeys||[]).map(j=>{
  const arrival=tflTime(j.arrivalDateTime),departure=tflTime(j.startDateTime);
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
