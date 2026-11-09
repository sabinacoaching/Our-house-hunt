// Runs inside the Maps tab opened for this route. The background supplies a
// scheduled Maps URL; this reader verifies it instead of editing time controls.
async function houseHuntReadMapsPage(request){
 let stage='directions';
 try{
  const sleep=ms=>new Promise(done=>setTimeout(done,ms));
  const blocked=()=>/unusual traffic|verify you are human|not a robot|automated queries|captcha/i.test(document.body?.innerText||'')||!!document.querySelector('#captcha-form');
  async function waitFor(fn,label,ms=25000){stage=label;const until=Date.now()+ms;while(Date.now()<until){if(blocked())throw Error('GOOGLE_VERIFICATION_REQUIRED');const v=fn();if(v)return v;await sleep(350)}throw Error(label+' unavailable')}
  function cards(){return [...document.querySelectorAll('[data-trip-index][role="link"],[data-trip-index][role="button"]')].filter(e=>e.querySelector('h1')).map(e=>{
   const lines=(e.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
   return {duration:lines.find(x=>/^(?:(?:\d+)\s*(?:hr|hrs|hour|hours|h)\s*)?(?:\d+\s*(?:min|mins|minutes))?$/i.test(x)&&/\d/.test(x))||'',heading:e.querySelector('h1')?.innerText||'',distance:lines.find(x=>/^\d+(?:[.,]\d+)?\s*(?:miles?|mi|km|m|metres?|meters?|ft|feet)$/i.test(x))||'',modes:[...e.querySelectorAll('img[alt], [role="img"][aria-label]')].map(x=>x.getAttribute('alt')||x.getAttribute('aria-label')).filter(Boolean)};
  })}
  async function stableCards(previous=null){let last='',stable=0;return waitFor(()=>{
   if(request.mode==='depart'&&/no (?:public transport|transit) routes? (?:found|available)|could(?:n.t| not) find (?:a )?(?:public transport|transit) route/i.test(document.body?.innerText||''))return {noRoute:true};
   const c=cards(),s=JSON.stringify(c);if(!c.length||previous&&s===previous){last=s;stable=0;return null}stable=s===last?stable+1:0;last=s;return stable>=2?c:null;
  },'Google route results',30000)}
  const reject=document.querySelector('button[aria-label*="Reject all" i],button[aria-label*="Decline" i]');if(reject)reject.click();
  await waitFor(()=>document.querySelector('input[aria-label^="Starting point"],input[aria-label^="Choose starting point"]'),'Google directions');
  const current=decodeURIComponent(location.href);if(!current.includes(request.origin))throw Error('Google origin did not match requested point');
  if(request.destinationKind==='point'&&!current.includes(request.destination))throw Error('Google destination did not match requested station entrance');
  if(request.destinationKind==='fixed')await waitFor(()=>{const d=document.querySelector('input[aria-label^="Destination"],input[aria-label^="Choose destination"]'),s=String(d?.value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return (request.destinationCheck||[]).every(part=>s.includes(part))},'Google destination',15000);
  if(request.mode==='walking')return {rows:await stableCards(),url:location.href};
  if(request.mode==='depart'&&!document.querySelector('input[name="transit-time"]')){
   const visible=await stableCards();
   if(visible.noRoute||Array.isArray(visible)&&visible.length&&visible.every(r=>r.modes.some(m=>/^walk(?:ing)?$/i.test(m))&&!r.modes.some(m=>/^(train|bus|tram|subway|rail|underground|ferry|light rail)$/i.test(m))))return {noRoute:true,url:location.href};
  }
  function clockMatches(value){const m=String(value||'').replace(/\u00a0|\u202f/g,' ').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);if(!m)return false;const h=m[3]?Number(m[1])%12+(/PM/i.test(m[3])?12:0):Number(m[1]);return h<24&&Number(m[2])<60&&String(h).padStart(2,'0')+':'+m[2]===request.time24}
  function correctSchedule(){
   // The URL carries the full date, time and arrive/depart flag. Verify that
   // Maps also applied the visible time field, without parsing localized dates.
   if(!clockMatches(document.querySelector('input[name="transit-time"]')?.value))return false;
   const stamp=location.href.match(/!8j(\d{9,})/);if(!stamp||!location.href.includes('!6e'+(request.mode==='arrive'?'1':'0')))return false;
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(stamp[1])*1000)).map(x=>[x.type,x.value]));
   return p.year+'-'+p.month+'-'+p.day===request.date&&p.hour+':'+p.minute===request.time24;
  }
  await waitFor(correctSchedule,'Requested Google timetable',20000);
  const first=await stableCards(),url=location.href;if(first.noRoute)return {noRoute:true,url};
  const later=request.mode==='arrive'?[...document.querySelectorAll('button')].find(x=>/later trips/i.test(x.getAttribute('aria-label')||'')):null;
  if(request.phase==='later'){
   if(!later)return {rows:[],url};
   const before=JSON.stringify(cards());later.click();const next=await stableCards(before);
   return {rows:Array.isArray(next)?next:[],url,date:request.date,time:request.time24};
  }
  // Return the initial results before clicking anything that could navigate.
  return {rows:first,hasLater:!!later,url,date:request.date,time:request.time24};
 }catch(error){
  // Chrome can otherwise return an undefined InjectionResult for a rejected
  // async function, hiding the real error behind "no route options".
  return {error:String(error?.message||error),diagnostic:{stage,url:location.href,time:document.querySelector('input[name="transit-time"]')?.value||null,dates:[...document.querySelectorAll('button')].map(x=>(x.innerText||'').trim()).filter(x=>/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(x)).slice(0,5)}};
 }
}
