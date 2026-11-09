// Parse only values displayed in Google Maps. No route is estimated.
(function(root){
 'use strict';
 function duration(s){
  const x=String(s||'').replace(/\u00a0|\u202f/g,' ').trim();
  const h=x.match(/(\d+)\s*(?:h(?:ou)?rs?|hours?)\b/i),m=x.match(/(\d+)\s*(?:mins?|minutes?)\b/i);
  if(!h&&!m)return null;const n=(h?+h[1]*60:0)+(m?+m[1]:0);return n>0?n:null;
 }
 function clock(h,m,amp){h=Number(h);m=Number(m);if(m>59||h>23)return null;if(amp){if(h<1||h>12)return null;h=h%12+(amp.toUpperCase()==='PM'?12:0)}return h*60+m}
 function times(s){
  const re=/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:\([^)]*\))?\s*[–—-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
  const m=String(s||'').replace(/\u00a0|\u202f/g,' ').match(re);if(!m)return null;
  const a=clock(m[1],m[2],m[3]||m[6]),b=clock(m[4],m[5],m[6]||m[3]);return a==null||b==null?null:{departure:a,arrival:b};
 }
 function readTransit(rows,target,mode='arrive'){
  if(!Number.isInteger(target)||target<0||target>=1440)throw Error('Invalid requested time');
  const valid=(rows||[]).map(r=>{const t=times(r.heading),minutes=duration(r.duration);if(!t||!minutes)return null;const elapsed=(t.arrival-t.departure+1440)%1440;
   if(Math.abs(elapsed-minutes)>1||!(r.modes||[]).some(x=>/^(train|bus|tram|subway|rail|underground|ferry|light rail)$/i.test(x)))return null;
   return {...t,minutes,heading:r.heading};}).filter(Boolean);
  if(mode==='depart')return valid.filter(x=>x.departure>=target).sort((a,b)=>a.minutes-b.minutes||a.departure-b.departure)[0]||null;
  const earlier=valid.filter(x=>x.arrival<=target),window=earlier.filter(x=>target-x.arrival<=5);
  return (window.length?window.sort((a,b)=>a.minutes-b.minutes||b.arrival-a.arrival):earlier.sort((a,b)=>b.arrival-a.arrival||a.minutes-b.minutes))[0]||null;
 }
 function readWalk(rows){
  for(const r of rows||[]){const minutes=duration(r.duration),m=String(r.distance||'').replace(/\u00a0|\u202f/g,' ').match(/([\d,.]+)\s*(mi(?:le)?s?|km|kilomet(?:er|re)s?|m(?:et(?:er|re)s?)?|ft|feet)\b/i);if(!minutes||!m)continue;
   const n=Number(m[1].replace(',','.')),unit=m[2].toLowerCase();if(!Number.isFinite(n)||n<=0)continue;const miles=/^k/.test(unit)?n/1.609344:/^f/.test(unit)?n/5280:/^m(?:et|$)/.test(unit)?n/1609.344:n;
   return {walking_minutes:minutes,walking_miles:Math.round(miles*1000)/1000,display_distance:r.distance};
  }return null;
 }
 root.HouseHuntGoogleRoutes={duration,times,readTransit,readWalk};
})(globalThis);
