import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('const updatingLocations=new Set();'),html.indexOf('async function resumePendingRoutes('));
function fixture(fail){
 let writes=0,refreshes=0,reports=[];const row={id:'house',address:'Alpine Close',latitude:51.3,longitude:-.1,journey_estimates:{dilly:{minutes:63}},station_commutes:{results:[{name:'East Croydon',walking_minutes:9}]}};
 const sb={from(){return {select(){return this},eq(){return this},single:async()=>({data:structuredClone(row)}),update(){writes++;return this}}}};
 const ext=async action=>{assert.equal(action,'PING');return {version:'0.16.0'}};
 const queue=async()=>{if(fail)throw Error('Google unavailable')};
 const update=new Function('sb','report','extension','queueGoogleHouse','pendingJourneyImportIds','refresh',code+';return updateLocationForAddress')(sb,(s)=>reports.push(s),ext,queue,new Set(),async()=>refreshes++);
 return {update,row,writes:()=>writes,refreshes:()=>refreshes,reports};
}
test('a failed calculation after an address change does not clear saved routes',async()=>{const f=fixture(true),before=structuredClone(f.row);assert.equal(await f.update('house'),false);assert.equal(f.writes(),0);assert.deepEqual(f.row,before);assert.match(f.reports.at(-1),/Google unavailable/)});
test('a successful route update refreshes the table without issuing a clearing update',async()=>{const f=fixture(false);assert.equal(await f.update('house'),true);assert.equal(f.writes(),0);assert.equal(f.refreshes(),1)});
