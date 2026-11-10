import {stationChoice} from './station-choice-state.js?v=1';
const stationNames=p=>[String(p.station_name||'').trim(),String(p.station_2_name||'').trim(),String(p.station_3_name||'').trim()];
const normalizedStation=s=>String(s||'').toLowerCase().replace(/\s*\([^)]*\)/g,'').replace(/\b(?:railway|rail|train|station)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stationOverride=(c,name)=>{
 const entries=Object.entries(c.google_verified||{});
 if(c.google_verified?.[name])return c.google_verified[name];
 const wanted=normalizedStation(name),matching=entries.filter(([key])=>normalizedStation(key)===wanted);
 return matching.length===1?matching[0][1]:{};
};
const completed=p=>{
 const q=p.station_commutes?.tfl_final,names=stationNames(p),coords=p.latitude+','+p.longitude;
 return !!(q?.complete&&(q.origin===coords||(q.origin_input&&q.origin_input===p.address))&&JSON.stringify(q.names)===JSON.stringify(names.slice(0,q.names?.length||2)));
};
export function stationWalkingMiles(p,i){
 const field=['station_distance_miles','station_2_distance_miles','station_3_distance_miles'][i];
 if(p.manual_overrides?.[field])return p[field]??null;
 const replacement=stationChoice(p,i);
 if(replacement)return stationOverride(p.station_commutes||{},stationNames(p)[i]).walking_miles??replacement.walking?.walking_miles??null;
 const c=p.station_commutes||{},name=stationNames(p)[i],r=c.results?.[i]?.name===name?c.results[i]:{},t=completed(p)&&c.tfl_final.results?.[i]?.name===name?c.tfl_final.results[i]:null;
 const google=c.google_routes?.origin===p.address&&c.google_routes?.stations?.[i]===name&&c.google_routes.results?.[i]?.walking_minutes!=null?c.google_routes.results[i]:null;
 return stationOverride(c,name).walking_miles??google?.walking_miles??t?.walking_miles??r.walking_miles??r.google_walking?.miles??p[i===0?'station_distance_miles':i===1?'station_2_distance_miles':'station_3_distance_miles'];
}
export function stationWalkingMapUrl(p,i){
 const replacement=stationChoice(p,i);
 if(replacement?.origin&&replacement?.destination)return replacement.walking?.url||'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:replacement.origin.lat+','+replacement.origin.lon,destination:replacement.destination.query,travelmode:'walking',hl:'en'});
 const name=stationNames(p)[i],c=p.station_commutes||{},location=p.import_diagnostics?.source_location;
 const sourceMatches=location?.source==='listing-street-view'&&location.listing_url===p.url&&location.address_input===p.address&&p.latitude!=null&&p.longitude!=null&&Number(location.latitude)===Number(p.latitude)&&Number(location.longitude)===Number(p.longitude);
 const checked=c.google_routes;
 if(sourceMatches&&checked?.origin===p.address&&checked?.stations?.[i]===name&&checked.results?.[i]?.destination_mode==='named-station'&&checked.results[i].walking_url)return checked.results[i].walking_url;
 const origin=sourceMatches?p.latitude+','+p.longitude:p.address+', United Kingdom';
 const destination=/tram/i.test(name)?name.replace(/\s*(?:tram\s*)?stop$/i,'')+' Tram Stop, United Kingdom':/underground|tube/i.test(name)||name==='Ealing Common'?name.replace(/\s*underground$/i,'')+' Underground Station, United Kingdom':name.replace(/\s*(?:railway|rail|train|station)$/i,'')+' Railway Station, United Kingdom';
 return 'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin,destination,travelmode:'walking',hl:'en'});
}
// Station times are calculated once by TfL and saved in the property record.
// A single walking link opens Google Maps with the destination's station name.
export function setupStationAccess({sb,history,shouldAutoCalculate}){
 const queue=[],pending=new Set(),attempted=new Set(),views=new Map();let working=false;
 const el=(tag,cls='',content='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=content;return e};
 const names=stationNames;
 const coords=p=>p.latitude+','+p.longitude;
 function render(p,i){
  const v=views.get(p.id+':'+i);if(!v)return;
  const c=p.station_commutes||{},r=c.results?.[i]?.name===names(p)[i]?c.results?.[i]:{},t=completed(p)&&c.tfl_final.results?.[i]?.name===names(p)[i]?c.tfl_final.results?.[i]:null,override=stationOverride(c,names(p)[i]);
  const replacement=stationChoice(p,i);
  if(replacement){
   const mi=stationWalkingMiles(p,i),minutes=override.walking_minutes??replacement.walking?.walking_minutes,pt=override.pt_minutes??(replacement.transit?.unavailable?null:replacement.transit?.minutes);
   v.walk.textContent=replacement.walking||minutes!=null?'Walking: '+(mi==null?'':Number(mi).toFixed(2)+' mi')+(minutes==null?'':' / '+Math.round(minutes)+' min')+(override.walking_minutes!=null?' · manual':' · Google'):'Walking: '+(replacement.error?'pending · Refresh to retry':'pending');
   v.walk.title=replacement.error||'Click to edit walking miles and minutes';
   v.link.hidden=!replacement.destination;v.link.href=stationWalkingMapUrl(p,i);
   v.pt.textContent='PT: '+(pt!=null?Math.round(pt)+' min':replacement.transit?'—':replacement.error?'pending · Refresh to retry':'pending');
   v.pt.title=replacement.error||'Google Maps';return;
  }
  const google=c.google_routes?.origin===p.address&&c.google_routes?.stations?.[i]===names(p)[i]&&c.google_routes.results?.[i]?.walking_minutes!=null?c.google_routes.results[i]:null;
  const mi=stationWalkingMiles(p,i);
  const mins=override.walking_minutes??google?.walking_minutes??t?.walking_minutes??r.walking_minutes??r.google_walking?.minutes??null;
  const approxMiles=!p.manual_overrides?.[['station_distance_miles','station_2_distance_miles','station_3_distance_miles'][i]]&&google?.walking_miles==null&&override.walking_miles==null&&t?.walking_miles==null&&r.walking_miles==null&&r.google_walking?.miles==null;
  const approxMins=google?.walking_minutes==null&&override.walking_minutes==null&&t?.walking_minutes==null&&r.walking_minutes==null&&r.google_walking?.minutes==null;
  v.walk.textContent='Walking: '+(mi!=null?(approxMiles?'~':'')+Number(mi).toFixed(2)+' mi':'—')+(mins!=null?' / '+(approxMins?'~':'')+Math.round(mins)+' min':'')+(override.walking_minutes!=null?' · manual':google?.walking_minutes!=null?' · Google':'');
  v.link.href=stationWalkingMapUrl(p,i);
  const pt=override.pt_minutes??(google?google.pt_minutes:(t?.pt_minutes??t?.avg_minutes??r.pt_minutes??r.avg_minutes));
  const exactPt=override.pt_minutes!=null||google?.pt_minutes!=null||!!t?.pt_departure||!!r.pt_departure;
  v.pt.textContent='PT: '+(pt!=null?(exactPt?'':'~')+Math.round(pt)+' min':'—');
  v.pt.title=override.pt_minutes!=null?(override.source==='manual'?'Manually entered time':'User-verified time'):google?.pt_minutes!=null?'Google Maps':t?.pt_departure?'TfL departure '+t.pt_departure:t?'TfL five Tuesday departures':r.avg_minutes!=null?'Previous TfL saved time':'No timetable route';
 }
 async function drain(){
  if(working)return;working=true;
  while(queue.length){
   const p=queue.shift();pending.delete(p.id);
   if(attempted.has(p.id))continue;attempted.add(p.id);
   try{
    const r=await sb.functions.invoke('house-hunt-station-commutes',{body:{id:p.id}});
    if(r.error)throw r.error;
    if(!r.data?.commutes)throw Error(r.data?.error||'Missing journey result');
    p.station_commutes=r.data.commutes;render(p,0);render(p,1);render(p,2);
   }catch(e){console.warn('Journey calculation unavailable for '+p.address,e)}
   await new Promise(done=>setTimeout(done,900));
  }
  working=false;
 }
 function editLine(p,i,kind,host){
  if(host.querySelector('input'))return;
  const orig=host.textContent,which=names(p)[i],cache=p.station_commutes?.results?.[i]||{},manual=p.station_commutes?.google_verified?.[which]||{};
  const replacement=stationChoice(p,i),originalMile=stationWalkingMiles(p,i);
  const values=kind==='walking'?
     [['walking_miles','Miles',manual.walking_miles??cache.walking_miles??originalMile],
      ['walking_minutes','Minutes',manual.walking_minutes??replacement?.walking?.walking_minutes??cache.walking_minutes]]:
     [['pt_minutes','Minutes',manual.pt_minutes??replacement?.transit?.minutes??cache.avg_minutes]];
  const box=document.createElement('span');box.className='hh-route-inline-edit';
  const fields=[];
  for(const [key,label,old] of values){
    const wrap=document.createElement('label'),small=document.createElement('small'),input=document.createElement('input');
    small.textContent=label;input.type='number';input.min='0';input.step='any';input.value=old??'';
    input.setAttribute('aria-label',label+' to '+which);
    wrap.append(small,input);box.append(wrap);fields.push([key,input]);
  }
  const save=document.createElement('button'),cancel=document.createElement('button');
  save.type='button';save.textContent='Save';save.className='hh-route-save';
  cancel.type='button';cancel.textContent='Cancel';cancel.className='hh-route-cancel';
  const revert=()=>{host.replaceChildren();host.textContent=orig};
  save.onclick=async()=>{
    const next={...(p.station_commutes?.google_verified?.[which]||{}),source:'manual',updated_at:new Date().toISOString()};
    for(const [key,input] of fields){
     const n=input.value.trim()===''?null:Number(input.value);
     if(n!=null&&(!Number.isFinite(n)||n<0)){alert('Enter a valid number');return}
     next[key]=n;
    }
    save.disabled=true;
    const changes={station_commutes:{...(p.station_commutes||{}),google_verified:{...(p.station_commutes?.google_verified||{}),[which]:next}}};
    if(kind==='walking')changes[i===0?'station_distance_miles':i===1?'station_2_distance_miles':'station_3_distance_miles']=next.walking_miles;
    const r=await history.save(p,changes);
    if(r.error){alert('Could not save: '+r.error.message);save.disabled=false;return}
    host.replaceChildren();render(p,i);
  };
  cancel.onclick=revert;
  box.append(save,cancel);host.replaceChildren(box);
  const input=fields[0]?.[1];input?.focus();input?.select();
  box.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save.click()}if(e.key==='Escape'){e.preventDefault();cancel.click()}});
 }
 function attach(p,i){
  const box=el('div','hh-station-access'),walk=el('div','hh-station-walk'),
    link=el('a','hh-station-google','Google Maps walking ↗'),pt=el('div','hh-station-pt');
  link.target='_blank';link.rel='noopener noreferrer';
  walk.title='Click to edit walking miles and minutes';walk.classList.add('hh-route-editable');
  pt.title='Click to edit PT minutes';pt.classList.add('hh-route-editable');
  walk.tabIndex=0;pt.tabIndex=0;walk.setAttribute('role','button');pt.setAttribute('role','button');
  walk.onclick=e=>{if(e.target===walk)editLine(p,i,'walking',walk)};
  pt.onclick=e=>{if(e.target===pt)editLine(p,i,'pt',pt)};
  walk.onkeydown=e=>{if(e.target===walk&&(e.key==='Enter'||e.key===' ')){e.preventDefault();editLine(p,i,'walking',walk)}};
  pt.onkeydown=e=>{if(e.target===pt&&(e.key==='Enter'||e.key===' ')){e.preventDefault();editLine(p,i,'pt',pt)}};
  box.append(walk,link,pt);
  views.set(p.id+':'+i,{walk,link,pt});render(p,i);
  if(shouldAutoCalculate?.(p)&&p.latitude!=null&&p.longitude!=null&&names(p).slice(0,2).every(Boolean)&&!completed(p)&&!pending.has(p.id)&&!attempted.has(p.id)){
   pending.add(p.id);queue.push(p);void drain();
  }
  return box;
 }
 return {attach,refresh:p=>{for(let i=0;i<3;i++)render(p,i)}};
}
