import {chromium} from 'playwright-core';
import {readFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const script=readFileSync(new URL('../extension/google-route-page.js',import.meta.url),'utf8');
const origin='51.4631369,-0.3552057';
const day=new Date();day.setUTCDate(day.getUTCDate()+((2-day.getUTCDay()+7)%7||7));
const date=day.toISOString().slice(0,10);
const dayLabel=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(day);
const calendarLabel=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(day);
try{
 for(const [mode,destination,time24,check] of [['walking','51.46223,-0.36195',null,[]],['depart','51.46223,-0.36195','07:30',[]],['arrive','Waterloo Station, London SE1 8SW','07:40',['waterloo']]]){
  const page=await browser.newPage({locale:'en-GB',timezoneId:'Europe/London'});
  const url='https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin,destination,travelmode:mode==='walking'?'walking':'transit',hl:'en'});
  const start=Date.now();
  try{
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.addScriptTag({content:script});
   const [hour,minute]=(time24||'07:30').split(':').map(Number);
   const args={origin,destination,destinationKind:mode==='arrive'?'fixed':'point',destinationCheck:check,mode,date,dayLabel,calendarLabel,time24,timeLabel:(hour%12||12)+':'+String(minute).padStart(2,'0')+' '+(hour>=12?'PM':'AM')};
   const result=await page.evaluate(args=>houseHuntReadMapsPage(args),args);
   console.log(JSON.stringify({mode,ms:Date.now()-start,result}));
  }catch(error){console.log(JSON.stringify({mode,ms:Date.now()-start,error:String(error),url:page.url(),text:(await page.locator('body').innerText()).slice(0,6000)}))}
  await page.close();
 }
}finally{await browser.close()}
