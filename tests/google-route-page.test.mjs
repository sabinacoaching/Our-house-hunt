import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../extension/google-route-page.js',import.meta.url),'utf8');
function makePage({blocked=false,walking=false,dateLabel='Tue, Nov 10',timeValue='7:50 PM',wrongDate=false}={}){
 let later=false,time=timeValue;const origin='51.41,-0.31',destination='63 Upper Richmond Road, London SW15 2RD';
 const cards=()=> (walking?[['8 min','', '0.4 mile',['Walk']]]:later?[['38 min','7:09 PM—7:47 PM','',['Train','Bus']],['30 min','7:27 PM—7:57 PM','',['Train']]]:[['38 min','7:09 PM—7:47 PM','',['Train','Bus']],['37 min','7:03 PM—7:40 PM','',['Train','Bus']]]).map(([duration,heading,distance,modes])=>({innerText:[duration,heading,distance].join('\n'),querySelector:s=>s==='h1'?{innerText:heading||'Walking route'}:null,querySelectorAll:()=>modes.map(m=>({getAttribute:()=>m}))}));
 const dateButton={innerText:dateLabel,getAttribute:()=>null},menu={innerText:'Arrive by'},laterButton={getAttribute:()=> 'Later trips',click:()=>{later=true}},dest={value:destination};
 class Input {get value(){return time}set value(v){assert.fail('The reader must not type into the time field')}focus(){assert.fail('The reader must not focus the time field')}blur(){}dispatchEvent(){assert.fail('No synthetic time-field keyboard events')}}
 const input=new Input(),pageUrl=`https://www.google.com/maps/dir/${origin}/${encodeURIComponent(destination)}?x=!6e1!7e2!8j${wrongDate?'1794253800':'1794340200'}`;
 const document={body:{innerText:blocked?'unusual traffic':''},querySelector(s){if(s.includes('#captcha-form'))return null;if(s.includes('Starting point'))return {};if(s.includes('Destination'))return dest;if(s.includes('transit-time'))return input;return null},querySelectorAll(s){if(s.startsWith('[data-trip-index]'))return cards();if(s==='button[aria-haspopup="menu"]')return [menu];if(s==='button')return [dateButton,laterButton];return []}};
 let tick=0;class TestDate extends Date {static now(){return tick+=1000}}
 const context=vm.createContext({document,location:{href:pageUrl},setTimeout:fn=>fn(),HTMLInputElement:Input,Event:class{},KeyboardEvent:class{},Intl,Date:TestDate});vm.runInContext(script,context);
 return {run:phase=>context.houseHuntReadMapsPage({origin,destination,destinationKind:'fixed',destinationCheck:['63upperrichmond','sw152rd'],mode:walking?'walking':'arrive',phase,dayLabel:'Tue, Nov 10',date:'2026-11-10',calendarLabel:'10 Nov',time24:'19:50',timeLabel:'7:50 PM'})};
}
test('reads the walking route cards after checking both points',async()=>{const page=makePage({walking:true});const result=await page.run();assert.equal(result.rows[0].duration,'8 min');assert.equal(result.rows[0].distance,'0.4 mile')});
test('returns a serializable error when Google presents an anti-bot screen',async()=>{const page=makePage({blocked:true});assert.match((await page.run()).error,/GOOGLE_VERIFICATION_REQUIRED/)});
test('returns initial results before a separate request reads later Google options',async()=>{const page=makePage();const result=await page.run();assert.equal(result.date,'2026-11-10');assert.equal(result.time,'19:50');assert.equal(result.rows.length,2);assert.equal(result.hasLater,true);const later=await page.run('later');assert.equal(later.rows.length,2);assert.ok(later.rows.some(r=>r.heading.includes('7:57 PM')))});
test('UK date order and a 24-hour clock do not require typing or calendar interaction',async()=>{const result=await makePage({dateLabel:'Tue, 10 Nov',timeValue:'19:50'}).run();assert.equal(result.time,'19:50');assert.equal(result.rows.length,2)});
test('a localized calendar caption cannot break the verified Maps timetable',async()=>{const result=await makePage({dateLabel:'вт, 10 нояб.',timeValue:'19:50'}).run();assert.equal(result.time,'19:50');assert.equal(result.rows.length,2)});
test('does not accept the right clock time on the wrong routing date',async()=>{const result=await makePage({wrongDate:true}).run();assert.match(result.error,/Requested Google timetable unavailable/);assert.equal(result.rows,undefined)});
