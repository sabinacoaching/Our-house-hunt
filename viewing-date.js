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
 if(old&&keys.every((key,index)=>Number(old[key])===Number(text[index])))return {value:original,error:null};
 const today=viewingDateParts(now);if(!today)return {error:'Could not determine the current date.'};
 const sameDay=old&&Number(old.day)===day&&Number(old.month)===month;
 const year=sameDay?old.year:today.year+(month*100+day<Number(today.month)*100+Number(today.day)?1:0);
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
export function createViewingDateFields(container){
 const fields={},prefix='viewing-date-'+(++editorId);let original=null;
 container.classList.add('hh-date-fields');container.setAttribute('role','group');container.setAttribute('aria-label','Viewing date');
 for(const [key,title,placeholder] of [['day','Day','DD'],['month','Month',''],['hours','Hours','HH'],['minutes','Minutes','MM']]){
  const label=document.createElement('label'),input=document.createElement(key==='month'?'select':'input');
  label.textContent=title;input.id=prefix+'-'+key;label.htmlFor=input.id;input.setAttribute('aria-label',title);
  if(key==='month'){
   const blank=document.createElement('option');blank.value='';blank.textContent='Choose month';input.append(blank);
   monthNames.forEach((name,index)=>{const option=document.createElement('option');option.value=String(index+1);option.textContent=name;input.append(option)});
  }else{input.type='text';input.inputMode='numeric';input.maxLength=2;input.placeholder=placeholder;input.autocomplete='off';input.addEventListener('focus',()=>input.select())}
  label.append(input);container.append(label);fields[key]=input;
 }
 const error=document.createElement('p');error.className='hh-date-error error';error.setAttribute('role','alert');container.append(error);
 const clear=()=>{for(const input of Object.values(fields))input.value='';error.textContent=''};
 return {
  setValue(value){original=value||null;clear();const parts=viewingDateParts(original);if(parts)for(const [key,input] of Object.entries(fields))input.value=parts[key]},
  clear,
  focus(){fields.day.focus()},
  read(){const result=parseViewingDateFields(Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value])),{original});error.textContent=result.error||'';return result}
 };
}
