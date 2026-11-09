// Runs only inside the Google Maps tab opened for one property route.
// Return the visible route cards, never internal Google network responses.
async function houseHuntReadMapsPage(request){
 try{
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const blocked=()=>/unusual traffic|verify you are human|not a robot|automated queries|captcha/i.test(document.body?.innerText||'')||!!document.querySelector('#captcha-form');
 async function waitFor(fn,label,ms=25000){const until=Date.now()+ms;while(Date.now()<until){if(blocked())throw Error('GOOGLE_VERIFICATION_REQUIRED');const v=fn();if(v)return v;await sleep(350)}throw Error(label+' unavailable')}
 function cards(){return [...document.querySelectorAll('[data-trip-index][role="link"],[data-trip-index][role="button"]')].filter(e=>e.querySelector('h1')).map(e=>{const h=e.querySelector('h1'),lines=(e.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean),dur=lines.find(x=>/^(?:(?:\d+)\s*(?:hr|hrs|hour|hours|h)\s*)?(?:\d+\s*(?:min|mins|minutes))?$/i.test(x)&&/\d/.test(x)),dist=lines.find(x=>/^\d+(?:[.,]\d+)?\s*(?:miles?|mi|km|m|metres?|meters?|ft|feet)$/i.test(x));return {duration:dur||'',heading:h?.innerText||'',distance:dist||'',modes:[...e.querySelectorAll('img[alt], [role="img"][aria-label]')].map(x=>x.getAttribute('alt')||x.getAttribute('aria-label')).filter(Boolean)}})}
 const sign=()=>JSON.stringify(cards());
 async function stableCards(previous=null){let last='',stable=0;return waitFor(()=>{if(request.mode==='depart'&&/no (?:public transport|transit) routes? (?:found|available)|could(?:n.t| not) find (?:a )?(?:public transport|transit) route/i.test(document.body?.innerText||''))return {noRoute:true};const c=cards(),s=JSON.stringify(c);if(!c.length||previous&&s===previous){last=s;stable=0;return null}stable=s===last?stable+1:0;last=s;return stable>=2?c:null},'Google route results',30000)}
 const reject=document.querySelector('button[aria-label*="Reject all" i],button[aria-label*="Decline" i]');if(reject)reject.click();
 await waitFor(()=>document.querySelector('input[aria-label^="Starting point"],input[aria-label^="Choose starting point"]'),'Google directions');
 const current=decodeURIComponent(location.href);if(!current.includes(request.origin))throw Error('Google origin did not match requested point');
 if(request.destinationKind==='point'&&!current.includes(request.destination))throw Error('Google destination did not match requested station entrance');
 if(request.destinationKind==='fixed')await waitFor(()=>{const dest=document.querySelector('input[aria-label^="Destination"],input[aria-label^="Choose destination"]'),text=String(dest?.value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return (request.destinationCheck||[]).every(part=>text.includes(part))},'Google destination',15000);
 if(request.mode==='walking')return {rows:await stableCards(),url:location.href};
 const wanted=request.mode==='arrive'?'Arrive by':'Depart at';
 const menu=await waitFor(()=>[...document.querySelectorAll('button[aria-haspopup="menu"]')].find(x=>/leave now|arrive by|depart at/i.test(x.innerText||'')),'Google time mode');
 if(!menu.innerText.toLowerCase().includes(wanted.toLowerCase())){menu.click();const choice=await waitFor(()=>[...document.querySelectorAll('[role="menuitemradio"]')].find(x=>(x.innerText||'').trim().toLowerCase()===wanted.toLowerCase()),'Google time option',5000);choice.click()}
 const input=await waitFor(()=>document.querySelector('input[name="transit-time"]'),'Google time field',6000);
 const dateButton=await waitFor(()=>[...document.querySelectorAll('button')].find(x=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+[A-Za-z]{3}\s+\d{1,2}$/i.test((x.innerText||'').trim())),'Google date');
 if((dateButton.innerText||'').trim()!==request.dayLabel){dateButton.click();const cell=await waitFor(()=>[...document.querySelectorAll('[role="gridcell"]')].find(x=>x.getAttribute('aria-label')===request.calendarLabel),'Google calendar date',5000);cell.click()}
 input.focus();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,request.timeLabel);else input.value=request.timeLabel;
 input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));input.blur();
 function correctSchedule(){const day=[...document.querySelectorAll('button')].some(x=>(x.innerText||'').trim()===request.dayLabel),field=document.querySelector('input[name="transit-time"]'),v=String(field?.value||'').replace(/\u00a0|\u202f/g,' ').toUpperCase().replace(/\s+/g,'');const url=location.href.match(/!8j(\d{9,})/);const match=v.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/),hour=match?(Number(match[1])%12+(match[3]==='PM'?12:match[3]?0:Math.floor(Number(match[1])/12)*12)):-1,clock=match?String(hour).padStart(2,'0')+':'+match[2]:'';if(!day||clock!==request.time24||!url)return false;const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(url[1])*1000));const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`===request.date&&`${o.hour}:${o.minute}`===request.time24}
 await waitFor(correctSchedule,'Requested Google timetable',20000);
 const initial=await stableCards(),initialUrl=location.href;if(initial.noRoute)return {noRoute:true,url:initialUrl};let all=[...initial];
 if(request.mode==='arrive'){
  const later=[...document.querySelectorAll('button')].find(x=>/later trips/i.test(x.getAttribute('aria-label')||''));
  if(later){const before=sign();later.click();try{all=all.concat(await stableCards(before))}catch(e){if(String(e).includes('GOOGLE_VERIFICATION_REQUIRED'))throw e}}
 }
 return {rows:all,url:initialUrl,date:request.date,time:request.time24};
 }catch(error){return {error:String(error?.message||error),diagnostic:{url:location.href,time:document.querySelector('input[name="transit-time"]')?.value||null,dates:[...document.querySelectorAll('button')].map(x=>(x.innerText||'').trim()).filter(x=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(x)).slice(0,5)}}}
}
