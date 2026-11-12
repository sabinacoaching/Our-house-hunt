const zone='Europe/London';
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const calendar=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function viewingDateParts(value){
 if(!value)return null;const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(calendar.formatToParts(date).map(p=>[p.type,p.value]));
 return {year:Number(parts.year),day:String(Number(parts.day)),month:String(Number(parts.month)),hours:parts.hour,minutes:parts.minute};
}
export function formatViewingDate(value){
 const parts=viewingDateParts(value);return parts?parts.day+' '+monthNames[Number(parts.month)-1].slice(0,3)+'\n'+parts.hours+':'+parts.minutes:'Set date';
}
export function parseViewingDateFields(fields,{original=null,now=new Date()}={}){
 const keys=['day','month','hours','minutes'],text=keys.map(key=>String(fields[key]??'').trim());
 if(text.every(value=>value===''))return {value:null,error:null};
 if(text.some(value=>!/^\d{1,2}$/.test(value)))return {error:'Enter day, month, hours and minutes.'};
 const [day,month,hours,minutes]=text.map(Number);
 if(month<1||month>12)return {error:'Choose a month.'};
 if(day<1||day>31)return {error:'Day must be between 1 and 31.'};
 if(hours>23)return {error:'Hours must be between 00 and 23.'};
 if(minutes>59)return {error:'Minutes must be between 00 and 59.'};
 const old=viewingDateParts(original);
 // Unchanged fields preserve the exact stored timestamp, including its seconds.
 if(old&&(!fields.year||Number(fields.year)===old.year)&&keys.every((key,index)=>Number(old[key])===Number(text[index])))return {value:original,error:null};
 const today=viewingDateParts(now);if(!today)return {error:'Could not determine the current date.'};
 const sameDay=old&&Number(old.day)===day&&Number(old.month)===month;
 const year=fields.year?Number(fields.year):sameDay?old.year:today.year+(month*100+day<Number(today.month)*100+Number(today.day)?1:0);
 if(!Number.isInteger(year)||year<1000||year>9999)return {error:'Choose a valid calendar date.'};
 const maximum=new Date(Date.UTC(year,month,0)).getUTCDate();
 if(day>maximum)return {error:monthNames[month-1]+' has '+maximum+' days. Enter a day from 1 to '+maximum+'.'};
 const target=Date.UTC(year,month-1,day,hours,minutes);let timestamp=target;
 // Resolve London wall-clock fields without relying on the device's time zone.
 for(let attempt=0;attempt<3;attempt++){
  const p=viewingDateParts(new Date(timestamp));
  const represented=Date.UTC(p.year,Number(p.month)-1,Number(p.day),Number(p.hours),Number(p.minutes));
  const difference=target-represented;if(!difference)break;timestamp+=difference;
 }
 const result=viewingDateParts(new Date(timestamp));
 if(result.year!==year||Number(result.month)!==month||Number(result.day)!==day||Number(result.hours)!==hours||Number(result.minutes)!==minutes)return {error:'This time does not exist in London on that date. Choose another time.'};
 return {value:new Date(timestamp).toISOString(),error:null};
}
let editorId=0;
export function createViewingDateFields(container,{clearButton=false}={}){
 const prefix='viewing-calendar-'+(++editorId);let original=null,selected=null,viewYear=0,viewMonth=0,dirty=false,clearRequested=false;
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
 container.classList.add('hh-viewing-picker');container.setAttribute('role','group');container.setAttribute('aria-label','Viewing date');
 const calendarBox=make('div','hh-calendar'),head=make('div','hh-calendar-head'),previous=make('button','secondary','‹'),next=make('button','secondary','›'),heading=make('strong'),week=make('div','hh-calendar-grid hh-calendar-week'),days=make('div','hh-calendar-grid hh-calendar-days');
 previous.type=next.type='button';previous.setAttribute('aria-label','Previous month');next.setAttribute('aria-label','Next month');heading.setAttribute('aria-live','polite');
 head.append(previous,heading,next);
 for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])week.append(make('span','',day));
 calendarBox.append(head,week,days);
 const label=make('label','hh-calendar-time','Time'),time=make('input');time.id=prefix+'-time';time.type='text';time.inputMode='numeric';time.maxLength=5;time.placeholder='HH:MM';time.autocomplete='off';time.setAttribute('aria-label','Time');label.htmlFor=time.id;label.append(time);
 const error=make('p','hh-date-error error');error.setAttribute('role','alert');container.replaceChildren(calendarBox,label,error);
 function render(){
  heading.textContent=monthNames[viewMonth-1];days.replaceChildren();
  const first=(new Date(Date.UTC(viewYear,viewMonth-1,1)).getUTCDay()+6)%7,total=new Date(Date.UTC(viewYear,viewMonth,0)).getUTCDate();
  for(let blank=0;blank<first;blank++){const span=make('span');span.setAttribute('aria-hidden','true');days.append(span)}
  for(let day=1;day<=total;day++){
   const button=make('button','hh-calendar-day',String(day));button.type='button';button.setAttribute('aria-label',day+' '+monthNames[viewMonth-1]);
   button.setAttribute('aria-pressed',String(!!selected&&selected.year===viewYear&&selected.month===viewMonth&&selected.day===day));
   button.onclick=()=>{selected={year:viewYear,month:viewMonth,day};dirty=true;clearRequested=false;error.textContent='';render();time.focus();time.select()};
   days.append(button);
  }
 }
 function move(delta){viewMonth+=delta;if(viewMonth<1){viewMonth=12;viewYear--}if(viewMonth>12){viewMonth=1;viewYear++}render()}
 previous.onclick=()=>move(-1);next.onclick=()=>move(1);
 time.addEventListener('focus',()=>time.select());
 time.addEventListener('input',()=>{dirty=true;clearRequested=false;error.textContent='';if(/^\d{3,4}$/.test(time.value))time.value=time.value.slice(0,2)+':'+time.value.slice(2)});
 const clear=()=>{selected=null;time.value='';dirty=true;clearRequested=true;error.textContent='';render()};
 if(clearButton){const button=make('button','secondary hh-calendar-clear','Clear date');button.type='button';button.onclick=clear;container.append(button)}
 return {
  setValue(value){
   original=value||null;const parts=viewingDateParts(original),today=viewingDateParts(new Date());
   selected=parts?{year:parts.year,month:Number(parts.month),day:Number(parts.day)}:null;
   viewYear=(parts||today).year;viewMonth=Number((parts||today).month);
   time.value=parts?parts.hours+':'+parts.minutes:'';dirty=false;clearRequested=false;error.textContent='';render();
  },
  clear,
  focus(){if(selected){time.focus();time.select()}else days.querySelector('button')?.focus()},
  read({requireDate=false}={}){
   const fail=message=>{error.textContent=message;return {error:message,changed:false}};
   if(clearRequested)return {value:null,error:null,changed:original!==null};
   if(!dirty){if(requireDate&&!original)return fail('Choose a date from the calendar and enter a time.');return {value:original,error:null,changed:false}}
   if(!selected)return fail('Choose a date from the calendar.');
   const match=time.value.trim().match(/^(\d{1,2}):(\d{2})$/);if(!match)return fail('Enter a time as HH:MM, for example 12:00.');
   const result=parseViewingDateFields({...selected,hours:match[1],minutes:match[2]},{original});
   error.textContent=result.error||'';return {...result,changed:!result.error&&result.value!==original};
  }
 };
}
