// The caller must first obtain all routes from the Google Maps page.
// Keep the user's own routes and comments intact.
export function buildGoogleRouteUpdate(p,location,stationPreview,google,{partial=false}={}){
 const source=location?.source_location,lat=Number(location?.latitude),lon=Number(location?.longitude),names=(stationPreview?.tfl_final?.names||[]).map(x=>String(x||'').trim());
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<=49||lat>=61||lon<=-9||lon>=3)throw Error('Missing confirmed origin');
 if((p.manual_overrides?.latitude&&Number(p.latitude)!==lat)||(p.manual_overrides?.longitude&&Number(p.longitude)!==lon))throw Error('Manual coordinates cannot be overwritten');
 if(!source||source.source!=='listing-street-view'||source.listing_url!==p.url||source.address_input!==p.address||Number(source.latitude)!==lat||Number(source.longitude)!==lon)throw Error('Street View source does not match the house');
 const preview=stationPreview?.tfl_final,stops=preview?.results||[],origin=lat+','+lon;
 if(preview&&(!preview.complete||preview.origin!==origin||names.length!==3||!names[0])||!preview&&!partial)throw Error('Station entrances are incomplete');
 const fields=['station_name','station_2_name','station_3_name'];for(let i=0;i<3;i++)if(preview&&p.manual_overrides?.[fields[i]]&&names[i]!==String(p[fields[i]]||'').trim())throw Error('Manual station cannot be overwritten');
 if(preview&&Object.keys(p.station_commutes?.google_verified||{}).length&&fields.some((field,i)=>String(p[field]||'').trim()&&names[i]!==String(p[field]).trim()))throw Error('Manually corrected stations cannot be overwritten');
 for(let i=0;i<names.length;i++)if(names[i]&&(!stops[i]?.entrance_id||stops[i].name!==names[i]))throw Error('Station entrance mismatch');
 const stationResults=names.map((name,i)=>{if(!name)return null;const w=google?.stations?.[i]?.walking,pt=google?.stations?.[i]?.transit;
  if(!w&&partial)return null;
  if(!w||w.source!=='Google Maps'||w.origin!==origin||w.destination!==stops[i].lat+','+stops[i].lon||w.walking_miles==null||w.walking_minutes==null||!(Number(w.walking_miles)>0)||!(Number(w.walking_minutes)>0))throw Error('Missing Google walking route');
  if((!pt&&!partial)||pt&&(pt.source!=='Google Maps'||pt.origin!==origin||pt.destination!==w.destination||(!pt.unavailable&&(pt.minutes==null||!(Number(pt.minutes)>0)))))throw Error('Missing Google station transport result');
  return {name,walking_miles:Number(w.walking_miles),walking_minutes:Number(w.walking_minutes),pt_minutes:!pt||pt.unavailable?null:Number(pt.minutes),walking_url:w.url,pt_url:pt?.url||null,destination:w.destination};
 });
 const next={...(p.journey_estimates||{})},automatic={};
 const deadlines={dancelab:'19:50',dilly:'18:40',waterloo:'07:40'};
 for(const id of ['dancelab','dilly','waterloo']){const v=google?.journeys?.[id];if(!v&&partial)continue;if(!v||v.source!=='Google Maps'||v.origin!==origin||!Number.isFinite(Number(v.minutes))||!v.departure||!v.arrival||!/^\d{4}-\d{2}-\d{2}$/.test(v.date||''))throw Error('Missing Google journey '+id);
  const dep=Date.parse(v.departure+'Z'),arr=Date.parse(v.arrival+'Z'),deadline=Date.parse(v.date+'T'+deadlines[id]+':00Z');
  if(!Number.isFinite(dep)||!Number.isFinite(arr)||arr>deadline||Math.abs((arr-dep)/60000-Number(v.minutes))>1)throw Error('Invalid Google journey timing '+id);
  const item={...v,id,minutes:Number(v.minutes),origin_input:p.address,origin_source:'Listing Street View',destination_address:v.destination,calculated_at:google.calculated_at,calculation_version:'google-visible-v1'};automatic[id]=item;if(next[id]?.manual_override!==true&&next[id]?.source!=='manual')next[id]=item;
 }
 const prev=p.import_diagnostics||{},history=Array.isArray(prev.routing_history)?prev.routing_history.slice(-4):[];
 if(!google.work||prev.google_routes_work?.job_id!==google.work.job_id)history.push({address:p.address,latitude:p.latitude,longitude:p.longitude,stations:p.station_commutes,journeys:p.journey_estimates});
 const complete=!!preview&&names.every((name,i)=>!name||stationResults[i]&&google.stations?.[i]?.transit)&&Object.keys(automatic).length===3&&!Object.keys(google.work?.errors||{}).length;
 const diag={...prev,source_location:source,route_pending:!complete,google_routes_version:complete?'google-maps-ui-v1':null,google_routes_completed_at:complete?google.calculated_at:prev.google_routes_completed_at||null,google_automatic_journeys:{...(prev.google_automatic_journeys||{}),...automatic},routing_history:history,...(google.work?{google_routes_work:google.work}:{})};
 const commutes={...(p.station_commutes||{}),google_verified:p.station_commutes?.google_verified||{}};
 if(preview){
  // Discovery carries identities and entrances, never an estimated travel time.
  commutes.tfl_final={...preview,complete:names.every((name,i)=>!name||stationResults[i]),results:stops.map((stop,i)=>stop?{...stop,walking_miles:stationResults[i]?.walking_miles??null,walking_minutes:stationResults[i]?.walking_minutes??null,source:'Google Maps'}:null)};
  commutes.google_routes={origin:p.address,origin_point:origin,stations:names,results:stationResults,source:'Google Maps',calculated_at:google.calculated_at};
 }
 const update={latitude:lat,longitude:lon,import_diagnostics:diag,station_commutes:commutes,journey_estimates:next};
 const distanceFields=['station_distance_miles','station_2_distance_miles','station_3_distance_miles'];
 for(let i=0;i<names.length;i++)if(!partial||stationResults[i]){if(!p.manual_overrides?.[fields[i]])update[fields[i]]=names[i]||null;if(!p.manual_overrides?.[distanceFields[i]])update[distanceFields[i]]=stationResults[i]?.walking_miles??null}
 return update;
}
