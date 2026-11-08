import {validStreetViewHint} from './import-utils.js?v=3';

// Replace only automatic routing data, preserving explicit user corrections.
export function buildLocationUpdate(property,hint){
 if(!validStreetViewHint(hint,property.address))return null;
 const overrides=property.manual_overrides||{};
 if(overrides.latitude||overrides.longitude)return null;
 const previous=property.import_diagnostics||{},priorStations=property.station_commutes||{},priorJourneys=property.journey_estimates||{};
 const history=Array.isArray(previous.routing_history)?previous.routing_history.slice(-4):[];
 history.push({address:previous.source_location?.address_input||property.address,latitude:property.latitude,longitude:property.longitude,stations:priorStations,journeys:priorJourneys});
 const source_location={source:'listing-street-view',listing_url:property.url,address_input:property.address,latitude:Number(hint.latitude),longitude:Number(hint.longitude),display_address:hint.address};
 const updates={latitude:source_location.latitude,longitude:source_location.longitude,import_diagnostics:{...previous,source_location,route_pending:true,routing_history:history},station_commutes:{google_verified:priorStations.google_verified||{}},journey_estimates:Object.fromEntries(Object.entries(priorJourneys).filter(([,v])=>v?.manual_override===true))};
 for(const key of ['station_name','station_2_name','station_3_name'])if(!overrides[key])updates[key]='';
 for(const key of ['station_distance_miles','station_2_distance_miles','station_3_distance_miles'])if(!overrides[key])updates[key]=null;
 return updates;
}
