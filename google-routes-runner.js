import {validStreetViewHint} from './import-utils.js?v=3';
import {buildGoogleRouteUpdate} from './google-route-update.js?v=1';

// A house is written only when every route belongs to the same source point.
export async function calculateGoogleRoutes(id,{sb,extension,progress=()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms))}){
 const result=await sb.from('properties').select('*').eq('id',id).single();
 if(result.error||!result.data)throw result.error||Error('House not found');
 const p=result.data;if(p.status==='deleted')throw Error('House was deleted');
 if(p.import_diagnostics?.google_routes_version==='google-maps-ui-v1')return {alreadyDone:true};
 let source=p.import_diagnostics?.source_location;
 const usable=source?.source==='listing-street-view'&&source.listing_url===p.url&&source.address_input===p.address&&Number(source.latitude)===Number(p.latitude)&&Number(source.longitude)===Number(p.longitude);
 if(!usable){
  progress('Reading the original listing map: '+p.address);
  const listing=await extension('IMPORT_URL',{url:p.url},70000),hint=listing?.location_hint;
  if(!validStreetViewHint(hint,p.address))throw Error('Original listing did not provide a matching Street View point');
  source={source:'listing-street-view',listing_url:p.url,address_input:p.address,latitude:Number(hint.latitude),longitude:Number(hint.longitude),display_address:hint.address||null};
 }
 const latitude=Number(source.latitude),longitude=Number(source.longitude),origin={lat:latitude,lon:longitude};
 if((p.manual_overrides?.latitude&&Number(p.latitude)!==latitude)||(p.manual_overrides?.longitude&&Number(p.longitude)!==longitude))throw Error('A manually corrected location needs to be retained');
 progress('Finding nearby station entrances: '+p.address);
 const found=await sb.functions.invoke('house-hunt-station-commutes',{body:{id,preview:true,discover:true,latitude,longitude}});
 if(found.error||found.data?.error||!found.data?.preview)throw found.error||Error(found.data?.error||'Station preview unavailable');
 const preview=found.data.commutes,stationData=preview?.tfl_final;
 if(!stationData?.complete)throw Error('Could not identify reliable station entrances');
 const google={calculated_at:new Date().toISOString(),stations:[],journeys:{}};
 async function route(kind,destination){await delay(1200);return extension('GOOGLE_ROUTE',{route:{kind,origin,...(destination?{destination}:{})}},130000)}
 for(let i=0;i<3;i++){
  const stop=stationData.results?.[i];if(!stationData.names?.[i]){google.stations.push(null);continue}
  if(!stop?.entrance_id||stop.lat==null||stop.lon==null)throw Error('Station entrance unavailable');
  const destination={lat:Number(stop.lat),lon:Number(stop.lon)};
  progress('Reading Google Maps: '+p.address+' → '+stop.name);
  const walking=await route('station_walk',destination),transit=await route('station_transit',destination);
  google.stations.push({walking,transit});
 }
 for(const kind of ['waterloo','dilly','dancelab']){progress('Reading Google Maps: '+p.address+' → '+kind);google.journeys[kind]=await route(kind)}
 google.calculated_at=new Date().toISOString();
 const patch=buildGoogleRouteUpdate(p,{latitude,longitude,source_location:source},preview,google);
 const saved=await sb.rpc('house_hunt_save_google_routes',{p_id:p.id,p_before:p,p_patch:patch});
 if(saved.error||saved.data!==true)throw saved.error||Error('House changed during calculation; routes were not saved');
 return {alreadyDone:false,address:p.address};
}
