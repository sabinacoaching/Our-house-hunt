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
  const validEarlier=valid.filter(x=>x.arrival<=target);
  const departure=x=>x.departure>x.arrival?x.departure-1440:x.departure;
  // Reject journeys for which another option leaves no earlier and arrives no later.
  // This comparison happens before the arrival window is applied.
  const earlier=validEarlier.filter(a=>!validEarlier.some(b=>b!==a&&departure(b)>=departure(a)&&b.arrival<=a.arrival&&(departure(b)>departure(a)||b.arrival<a.arrival)));
  const window=earlier.filter(x=>target-x.arrival<=5);
  return (window.length?window.sort((a,b)=>a.minutes-b.minutes||b.arrival-a.arrival):earlier.sort((a,b)=>b.arrival-a.arrival||a.minutes-b.minutes))[0]||null;
 }
 // Extract the actual step-by-step walking durations from Google Maps details.
 function readWalkingLegs(text){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];
  for(let i=0;i<lines.length;i++)if(/^walk(?:ing)?$/i.test(lines[i])){
   let found=null;for(let j=i+1;j<Math.min(lines.length,i+5);j++){
    if(/^(?:walk|train|bus|tram|underground|subway)$/i.test(lines[j]))break;
    if(/^(?:about\s+)?\d+\s*(?:h(?:ou)?rs?|hours?|mins?|minutes?)\b/i.test(lines[j])){found=duration(lines[j]);break}
   }
   if(found!=null)out.push(found);
  }
  return out;
 }
 function candidateDetails(row,target){
  const t=times(row?.heading),minutes=duration(row?.duration);if(!t||!minutes)return null;
  const elapsed=(t.arrival-t.departure+1440)%1440;if(Math.abs(elapsed-minutes)>1||t.arrival>target)return null;
  const modes=(row.modes||[]).filter(x=>/^(train|bus|tram|subway|rail|underground|ferry|light rail)$/i.test(x));
  if(!modes.length)return null;const steps=Array.isArray(row.walking_legs)?row.walking_legs:[];
  if(!steps.length)return null;
  const firstWalk=Number(steps[0]);if(!Number.isFinite(firstWalk)||firstWalk<0)return null;
  return {departure:t.departure,arrival:t.arrival,minutes,heading:row.heading,arrival_gap:target-t.arrival,transfers:Math.max(0,modes.length-1),first_walk_minutes:firstWalk,max_walk_minutes:Math.max(...steps),total_walk_minutes:steps.reduce((a,b)=>a+b,0)};
 }
 // Walking and transfers are preferences, never reasons to suppress a verified trip.
 function inconvenience(c){return (c.max_walk_minutes>=17?1:0)+(c.transfers>=2?1:0)}
 function compareCandidates(a,b){
  const pa=inconvenience(a),pb=inconvenience(b);
  return pa-pb||(pa?(a.transfers-b.transfers||a.max_walk_minutes-b.max_walk_minutes||a.total_walk_minutes-b.total_walk_minutes):0)||(b.departure>b.arrival?b.departure-1440:b.departure)-(a.departure>a.arrival?a.departure-1440:a.departure)||a.minutes-b.minutes||a.transfers-b.transfers||a.arrival_gap-b.arrival_gap;
 }
 function rankDetailedTransit(rows,target){
  const valid=(rows||[]).map(row=>{if(!row.details_verified)return null;const c=candidateDetails(row,target);if(!c)return null;
   if(!row.walking_legs.every(x=>Number.isFinite(x)&&x>=0))return null;
   return {...c,row};}).filter(Boolean).sort(compareCandidates);
  return {selected:valid[0]||null,top_three:valid.slice(0,3)};
 }
 function readWalk(rows){
  const options=[];
  for(const r of rows||[]){const minutes=duration(r.duration),m=String(r.distance||'').replace(/\u00a0|\u202f/g,' ').match(/([\d,.]+)\s*(mi(?:le)?s?|km|kilomet(?:er|re)s?|m(?:et(?:er|re)s?)?|ft|feet)\b/i);if(!minutes||!m)continue;
   const n=Number(m[1].replace(',','.')),unit=m[2].toLowerCase();if(!Number.isFinite(n)||n<=0)continue;const miles=/^k/.test(unit)?n/1.609344:/^f/.test(unit)?n/5280:/^m(?:et|$)/.test(unit)?n/1609.344:n;
   options.push({walking_minutes:minutes,walking_miles:Math.round(miles*1000)/1000,display_distance:r.distance});
  }return options.sort((a,b)=>a.walking_minutes-b.walking_minutes||a.walking_miles-b.walking_miles)[0]||null;
 }
 root.HouseHuntGoogleRoutes={duration,times,readTransit,readWalk,readWalkingLegs,candidateDetails,inconvenience,compareCandidates,rankDetailedTransit};
})(globalThis);
