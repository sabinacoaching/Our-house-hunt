const clean=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const ignored=new Set(['estate','estates','agents','agent','letting','lettings','property','properties','limited','ltd','sales','the','and','co']);
function agencyWords(name){
 const brand=String(name||'').split(/\s+[-–]\s+|,/)[0];
 return (brand.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(x=>x.length>=3&&!ignored.has(x));
}
function branchMarker(name,address){
 const postcode=String(address||'').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0];
 const label=String(name||'').split(/\s+[-–]\s+|,/)[1]?.trim();
 return {postcode:postcode?clean(postcode):'',label:label?clean(label):''};
}
export function selectAgencyWebsite(name,address,results){
 const brand=agencyWords(name),{postcode,label}=branchMarker(name,address);
 if(!brand.length||(!postcode&&!label))return null;
 const candidates=[];
 for(const result of results||[]){
  let url;try{url=new URL(result.url)}catch{continue}
  if(url.protocol!=='https:'||url.username||url.password)continue;
  const host=clean(url.hostname),text=clean([result.title,result.description,...(Array.isArray(result.snippets)?result.snippets:[])].join(' '));
  // The agency's own domain must contain its distinctive name; reject portals,
  // directories, social media and similarly ranked unrelated results.
  if(!brand.every(word=>host.includes(word)))continue;
  const foundPostcode=!!postcode&&text.includes(postcode);
  const foundBranch=!!label&&(text.includes(label)||clean(url.pathname).includes(label));
  const branchPath=/\b(?:branch|branches|office|offices)\b/i.test(url.pathname.replace(/[\/-]/g,' '));
  if(label&&branchPath&&!clean(url.pathname).includes(label)&&!foundPostcode)continue;
  if(!foundPostcode&&!foundBranch)continue;
  const score=(foundPostcode?100:0)+(foundBranch?50:0)+(/contact|branch|office/i.test(url.pathname)?5:0);
  candidates.push({url:url.href,host:url.hostname.replace(/^www\./,''),score});
 }
 candidates.sort((a,b)=>b.score-a.score);
 // Competing domains at the same confidence are ambiguous: leave blank.
 if(candidates.length>1&&candidates[0].score===candidates[1].score&&candidates[0].host!==candidates[1].host)return null;
 return candidates[0]?.url||null;
}
export function parseSearchResponse(body){
 const lines=String(body||'').split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim());
 if(!lines.length)lines.push(String(body||''));
 for(const line of lines){
  try{const message=JSON.parse(line);for(const item of message?.result?.content||[]){if(item.type==='text'){const json=JSON.parse(item.text);if(Array.isArray(json?.results?.web))return json.results.web}}}catch{}
 }
 throw Error('Search returned an invalid response');
}
