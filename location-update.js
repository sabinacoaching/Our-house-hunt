import {validStreetViewHint} from './import-utils.js?v=4';

// Replace only automatic routing data, preserving explicit user corrections.
export function buildLocationUpdate(property,hint){
 if(!validStreetViewHint(hint,property.address))return null;
 const overrides=property.manual_overrides||{};
 if(overrides.latitude||overrides.longitude)return null;
 const previous=property.import_diagnostics||{},priorStations=property.station_commutes||{},priorJourneys=property.journey_estimates||{};
 const history=Array.isArray(previous.routing_history)?previous.routing_history.slice(-4):[];
 history.push({address:previous.source_location?.address_input||property.address,latitude:property.latitude,longitude:property.longitude,stations:priorStations,journeys:priorJourneys});
 const source_location={source:'listing-street-view',listing_url:property.url,address_input:property.address,latitude:Number(hint.latitude),longitude:Number(hint.longitude),display_address:hint.address};
 // Never blank the previous station and journey values before replacements exist.
 return {latitude:source_location.latitude,longitude:source_location.longitude,import_diagnostics:{...previous,google_routes_version:null,source_location,route_pending:true,routing_history:history}};
}
