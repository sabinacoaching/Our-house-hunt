import {writeFileSync} from 'node:fs';
const modes='national-rail,overground,tube,tram,dlr,elizabeth-line';
for(const url of ['https://api.tfl.gov.uk/StopPoint/Mode/'+modes,'https://api.tfl.gov.uk/StopPoint?lat=51.4631369&lon=-0.3552057&stopTypes=NaptanRailStation,NaptanMetroStation&radius=4000&returnLines=false']){
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 const payload=await response.json();
 const stops=payload.stopPoints||[];
 function entrances(stop){return [...(String(stop.stopType||'').endsWith('Entrance')?[stop]:[]),...(stop.children||[]).flatMap(entrances)]}
 console.log(JSON.stringify({url,status:response.status,count:stops.length,withEntrances:stops.filter(s=>entrances(s).length).length,first:stops.slice(0,3).map(s=>({id:s.id,name:s.commonName,modes:s.modes,type:s.stopType,children:s.children?.map(x=>({id:x.id,name:x.commonName,type:x.stopType,children:x.children?.length})),entrances:entrances(s).map(x=>({id:x.id,stationNaptan:x.stationNaptan,lat:x.lat,lon:x.lon}))}))}));
 if(stops.length>100)writeFileSync('station-catalogue-raw.json',JSON.stringify(payload));
}
