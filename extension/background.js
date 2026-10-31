const validListing = url => {
  const u = new URL(url);
  if(u.protocol!=='https:')return false;
  if(['www.zoopla.co.uk','zoopla.co.uk'].includes(u.hostname))return /\/(for-sale|to-rent)\/details\/\d+/.test(u.pathname);
  if(['www.rightmove.co.uk','rightmove.co.uk'].includes(u.hostname))return /^\/properties\/\d+/.test(u.pathname);
  return false;
};
function waitForLoad(tabId,timeout=30000){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(new Error('Timed out loading property page'))},timeout);
  const listener=(id,change)=>{if(id===tabId&&change.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve()}};
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.get(tabId).then(tab=>{if(tab.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve()}}).catch(()=>{});
 });
}
async function readPropertyFromPage(){
 const source=/zoopla/i.test(location.hostname)?'Zoopla':'Rightmove';
 const mainText=document.body?.innerText?.slice(0,180000)||'';
 const meta=k=>document.querySelector('meta[property="'+k+'"]')?.content||document.querySelector('meta[name="'+k+'"]')?.content||'';
 const title=(meta('og:title')||document.title||document.querySelector('h1')?.textContent||'').trim();
 const description=meta('og:description')||meta('description')||'';
 const scripts=[...document.querySelectorAll('script')].map(x=>x.textContent||'');
 const photos=[],plans=[],photoSet=new Set(),planSet=new Set();
 // Prefer the listing's own ordered media structures. Zoopla's preview carousel
 // is cyclic and may start at photo 7, so it cannot define gallery order.
 let authoritativePhotos=null,authoritativePlans=null;
 if(source==='Rightmove'){
  for(const script of scripts){
   if(!script.includes('window.__PAGE_MODEL'))continue;
   try{
    const match=script.match(/"data"\s*:\s*("(?:\\.|[^"\\])*")/);
    if(!match)continue;
    const nodes=JSON.parse(JSON.parse(match[1]));
    const model=nodes[nodes[0].propertyData];
    const expected=location.pathname.match(/\/properties\/(\d+)/)?.[1];
    if(String(nodes[model.id])!==expected)throw Error('Rightmove listing ID mismatch');
    const media=key=>{
     const arr=nodes[model[key]];
     if(!Array.isArray(arr))return [];
     return arr.map(i=>nodes[nodes[i]?.url]).filter(x=>typeof x==='string');
    };
    authoritativePhotos=media('images');authoritativePlans=media('floorplans');
    break;
   }catch(e){console.warn('Rightmove media model unavailable',String(e))}
  }
 }
 if(source==='Zoopla'){
  const expected=location.pathname.match(/\/details\/(\d+)/)?.[1];
  for(const script of scripts){
   if(!script.includes('self.__next_f.push')||!script.includes('propertyImage')||!script.includes('floorPlan'))continue;
   try{
    const payload=JSON.parse(script.slice(script.indexOf('['),script.lastIndexOf(']')+1))[1];
    const root=JSON.parse(payload.slice(payload.indexOf(':')+1));
    let listing=null;
    const visit=x=>{
     if(!x||typeof x!=='object'||listing)return;
     if(String(x.listingId)===expected&&Array.isArray(x.propertyImage)&&x.floorPlan){listing=x;return}
     for(const value of Object.values(x))visit(value);
    };
    visit(root);
    if(!listing)continue;
    const media=items=>(items||[]).map(x=>x.filename).filter(x=>typeof x==='string'&&/^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(x)).map(x=>'https://lid.zoocdn.com/u/1200/900/'+x);
    const photosFromSource=media(listing.propertyImage);
    if(photosFromSource.length!==listing.propertyImage.length)continue;
    authoritativePhotos=photosFromSource;authoritativePlans=media(listing.floorPlan.image);
    break;
   }catch(e){console.warn('Zoopla media model unavailable',String(e))}
  }
 }
 if(source==='Zoopla'&&!authoritativePhotos){
  const button=[...document.querySelectorAll('button')].find(x=>/^\d+\s+photos?$/i.test((x.innerText||x.textContent||'').trim()));
  if(button){
   const expected=Number((button.innerText||button.textContent).match(/\d+/)?.[0]);
   button.click();
   for(let attempt=0;attempt<24;attempt++){
    await new Promise(r=>setTimeout(r,400));
    if(attempt===4&&!document.querySelector('[role="tabpanel"][id$="-content-images"]'))button.click();
    const panel=document.querySelector('[role="tabpanel"][id$="-content-images"]');
    const els=panel?[...panel.querySelectorAll('img')]:[];
    if(expected&&els.length===expected){
     const getSource=img=>{
      const set=img.closest('picture')?.querySelector('source')?.getAttribute('srcset')||'';
      const candidates=set.split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean);
      return candidates.at(-1)||img.currentSrc||img.src;
     };
     authoritativePhotos=els.map(getSource).filter(Boolean);break;
    }
   }
  }
 }

 const decode=s=>s.replaceAll('\\u002F','/').replaceAll('\\/','/').replaceAll('\\u0026','&').replaceAll('&amp;','&');
 function toUrl(s){
   if(typeof s!=='string'||!s)return null;
   s=decode(s).replace(/[),;}]$/,'').trim();
   // The listing JSON may have floorplanImage: true (a boolean flag).
   // The old code turned the string 'true' into https://www.zoopla.co.uk/.../true,
   // accepted it as a plan, and STOPPED looking before an image loaded.
   // Only actual ABSOLUTE CDN/image URLs are accepted.
   if(/^(?:true|false|null|undefined|yes|no|0|1)$/i.test(s))return null;
   if(s.startsWith('//'))s='https:'+s;
   // Valid media paths can be relative in Zoopla's React media payload.
   if(/^\/(?:u\/\d+\/\d+\/|image\/|static\/|media\/)/i.test(s))s='https://lid.zoocdn.com'+s;
   else if(!/^https:\/\//i.test(s))return null;
   try{const u=new URL(s);if(u.protocol!=='https:')return null;
     if(!/(^|\.)(zoocdn\.com|zoopla\.co\.uk|rightmove\.co\.uk)$/.test(u.hostname))return null;
     if(/(logo|avatar|favicon|agent-logo|brand|placeholder|\.svg$)/i.test(u.pathname))return null;
     if(/zoopla\.co\.uk$/.test(u.hostname)&&/\/(?:for-sale|to-rent)\/details\/\d+\/?$/i.test(u.pathname))return null;
     u.searchParams.delete('auto');return u.href;
   }catch{return null}
 }
 function add(value,kind='photo'){
   const u=toUrl(value);if(!u)return;
   const isPlan=kind==='floorplan'||/floor.?plan|_flp_|\/fp\//i.test(new URL(u).pathname);
   if(isPlan){if(!planSet.has(u)){planSet.add(u);plans.push(u)}return}
   if(/(map|floorplan|floor-plan|epc|energy-performance|pin)/i.test(new URL(u).pathname))return;
   if(!photoSet.has(u)){photoSet.add(u);photos.push(u)}
 }
 function urlsFrom(s){return decode(s).match(/https?:\/\/[^\s"'<>\\]{10,500}/g)||[]}
 function collectDOM(mode='gallery'){
   // Never classify a picture as a floor plan merely because its surrounding gallery says "Floor plans".
   for(const el of document.querySelectorAll('img, picture source')){
      const source=el.getAttribute('src')||el.getAttribute('data-src')||el.getAttribute('srcset')||'';
      const ownLabels=[el.alt,el.title,el.getAttribute('aria-label'),el.closest('[data-testid]')?.getAttribute('data-testid')].filter(Boolean).join(' ');
      const explicit=/floor[\s_-]?plans?|floor_plan|_flp_/i.test(ownLabels)||/floor[\s_-]?plans?|floor_plan|_flp_/i.test(source);
      if(mode==='floorplan'&&!explicit){
        // After activating the plan tab, gallery images may remain in the DOM.
        // Trust only an image inside a labelled FLOORPLAN component, not the whole tab.
        const parent=el.closest('[data-testid*=floorplan i],[aria-label*=floorplan i],[class*=floorplan i],[id*=floorplan i]');
        if(!parent)continue;
      }
      if(mode==='gallery'&&explicit)continue;
      const kind=mode==='floorplan'?'floorplan':'photo';
      for(const key of ['currentSrc','src','data-src','data-original','data-image']){
        const u=el[key]||el.getAttribute(key);if(u)add(u,kind);
      }
      const set=el.getAttribute('srcset')||el.getAttribute('data-srcset')||'';
      if(set){for(const u of set.split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean).slice(-4))add(u,kind)}
   }
 }
 add(meta('og:image'));add(meta('twitter:image'));
 collectDOM();
 // Embedded listing JSON often includes all gallery images and the floorplan, even when the floorplan tab is not open.
 function walk(o,field='',depth=0){
   if(depth>17||!o||typeof o!=='object')return;
   if(Array.isArray(o)){for(const v of o.slice(0,150))walk(v,field,depth+1);return}
   for(const [k,v] of Object.entries(o).slice(0,250)){
      const key=String(k);const isPlan=/(floor.?plans?|floor_plan|floorPlan)/i.test(key)||/(floor.?plan)/i.test(field);
      if(typeof v==='string'&&/(url|src|image|photo|floorplan|floor_plan|imageUrl|media)/i.test(key))add(v,isPlan?'floorplan':'photo');
      else if(typeof v==='object')walk(v,isPlan?'floorplan':key,depth+1);
   }
 }
 // Structured data: walk JSON objects for explicit image and floor-plan fields.
 for(const script of scripts){
   const raw=script.trim();
   if(raw.length<3000000&&(raw.startsWith('{')||raw.startsWith('['))){try{walk(JSON.parse(raw))}catch{}}
   // JSON from Next.js may contain escaped object data with explicit floorplan keys.
   // Extract ONLY URL values of floorplan-specific keys; do not scan a broad window of
   // neighbouring photo URLs (the old implementation sometimes saved a kitchen photo as a plan).
   if(!/floor.?plans?|floor_plan/i.test(raw))continue;
   const decoded=decode(raw.slice(0,2400000));
   for(const match of decoded.matchAll(/(?:"|')(?:floorplanImage|floorPlanImage|floorplanUrl|floorPlanUrl|floorplan_url|floorPlanImageUrl|floorplanImageUrl|floorplanSrc)(?:"|')\s*:\s*(?:"|')(https?:\/\/[^"'\s<>\\]+)(?:"|')/gi)){
     add(match[1],'floorplan');
   }
 }
  // Zoopla actually labels its control "1 Floor plan" (number BEFORE the label).
  // v0.5 did not match this caption; the floorplan viewer therefore never opened.
  const planCaption=/^(?:(?:view|open|show|see)\s+)?(?:(?:\d+)\s+)?floor[\s_-]*plans?(?:\s*\(\d+\)|\s+\d+)?$/i;
  const clickable=[...document.querySelectorAll('button,[role="tab"],[role="button"],a[href],[data-testid*=floorplan i],[data-testid*=floor-plan i]')];
  const isFloorButton=el=>planCaption.test((el.innerText||el.textContent||'').trim().replace(/\s+/g,' '))||
    planCaption.test((el.getAttribute('aria-label')||'').trim())||
    /(?:floor.?plan|floorPlan)/i.test(el.getAttribute('data-testid')||'');
  const floorTab=clickable.find(isFloorButton)||
    // Some React versions use an ordinary div/span as the clickable gallery tab.
    [...document.querySelectorAll('span,div')].find(el=>el.children.length<=2&&
      (el.textContent||'').trim().length<=35&&isFloorButton(el));
  let clickedPlanTab=false,planTabError=null;
  if(floorTab&&authoritativePlans===null){try{
    const oldResources=new Set((performance.getEntriesByType?.('resource')||[]).map(x=>x.name));
    const previous=new Set([...document.querySelectorAll('img, picture source')]
      .flatMap(el=>[el.currentSrc,el.src,el.getAttribute('src')]).filter(Boolean));
    floorTab.click();clickedPlanTab=true;
    // The image is lazy-loaded by React after the click. Wait for the actual DOM,
    // rather than assuming it appears within a fixed 1.4 seconds.
    for(let retry=0;retry<16;retry++){
      await new Promise(r=>setTimeout(r,500));
      collectDOM('floorplan');
      // Inspect resources loaded *because of* the plan tab, independent of its
      // React markup. Zoopla sometimes uses generic image viewer containers.
      for(const resource of (performance.getEntriesByType?.('resource')||[])){
        const url=String(resource.name||'');
        if(oldResources.has(url))continue;
        if(/zoocdn\.com|rightmove\.co\.uk/i.test(url)&&/\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(url))add(url,'floorplan');
      }
      for(const el of document.querySelectorAll('img, picture source')){
        const candidate=el.currentSrc||el.src||el.getAttribute('src')||el.getAttribute('data-src');
        if(!candidate||previous.has(candidate))continue;
        const context=el.closest('[role="dialog"],dialog,[aria-modal="true"],[data-testid*=floorplan i],[data-testid*=floor-plan i],[class*=floorplan i],[class*=floor-plan i],[aria-label*=floorplan i]');
        const label=[el.alt,el.title,el.getAttribute('aria-label')].filter(Boolean).join(' ');
        // A plan can appear in an unlabelled generic gallery overlay. A NEW
        // substantial image loaded only after pressing Floor plan is a candidate;
        // the site independently validates its diagram/room-label content.
        const newlyLoadedLargeImage=el.tagName?.toUpperCase()==='IMG'&&
          (el.naturalWidth||0)>=400&&(el.naturalHeight||0)>=240;
        const visible=el.getClientRects?.().length>0&&
          (el.naturalWidth||0)>=400&&(el.naturalHeight||0)>=240;
        // The tab is active: candidate validation (OCR / diagram pixels) runs on
        // the website, so we can include the current generic gallery image.
        if(context||/floor.?plan/i.test(label)||newlyLoadedLargeImage||visible)add(candidate,'floorplan');
      }
      // Some listing viewers render floor plans as a CSS background image.
      for(const el of document.querySelectorAll('[style*=background-image]')){
        const style=el.getAttribute('style')||'';
        const match=style.match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
        if(match&&el.closest('[role="dialog"],dialog,[data-testid*=floorplan i],[class*=floorplan i],[aria-label*=floorplan i]'))add(match[1],'floorplan');
      }
      // Canvas background or Next image components can include the media URL
      // only in the current interactive element's style or custom data values.
      for(const x of document.querySelectorAll('[style],[data-src],[data-image],[data-original],[data-full-src]')){
        const context=x.closest('[role="dialog"],dialog,[data-testid*=floorplan i],[class*=floorplan i],[class*=gallery i],[aria-label*=floorplan i]');
        if(!context)continue;
        const values=[x.getAttribute('data-src'),x.getAttribute('data-image'),x.getAttribute('data-original'),x.getAttribute('data-full-src'),x.getAttribute('style')||''];
        for(const v of values){if(!v)continue;for(const url of urlsFrom(v))add(url,'floorplan')}
      }
      for(const a of document.querySelectorAll('a[href]')){
        const label=[a.textContent,a.getAttribute('aria-label'),a.getAttribute('download')].join(' ');
        if(/floor[\s_-]*plan|download\s+plan/i.test(label)||a.closest('[data-testid*=floorplan i],[data-testid*=floor-plan i],[class*=floorplan i]')){
          const href=a.href;
          if(/\.(?:jpe?g|png|webp|pdf)(?:$|\?)/i.test(href))add(href,'floorplan');
        }
      }
      // Don't stop at the first candidate. An intermediate gallery image can
      // arrive before the real plan and must not suppress later candidates.
      if(plans.length>=12&&retry>=5)break;
    }
  }catch(e){planTabError=String(e);console.warn('Floorplan tab could not be read',e)}}
  // Serialized React/Next payloads sometimes carry an array of floor-plan URLs
  // even when the viewer's DOM remains hidden. Read only that named JSON array.
  if(!plans.length){
    for(const script of scripts){
      if(!/floor[\s_-]*plans?/i.test(script))continue;
      const raw=decode(script.slice(0,3000000));
      for(const matched of raw.matchAll(/["'](?:floorplans?|floor[_-]?plans?)["']\s*:\s*\[/gi)){
        const at=matched.index+matched[0].length;let depth=1,end=at,quoted=false,escaped=false;
        for(;end<Math.min(raw.length,at+60000);end++){
          const ch=raw[end];
          if(escaped){escaped=false;continue}
          if(ch==='\\'&&quoted){escaped=true;continue}
          if(ch==='"'){quoted=!quoted;continue}
          if(!quoted){if(ch==='[')depth++;if(ch===']'&&!--depth)break}
        }
        if(depth===0){
          const group=raw.slice(at,end);
          for(const url of urlsFrom(group))add(url.replace(/["']$/, ''),'floorplan');
        }
      }
    }
  }
 // Accept the actual labelled floor-plan panel, not unrelated images loaded
 // after opening the gallery. The panel is scoped to this listing's page.
 if(source==='Zoopla'&&authoritativePlans===null){
  authoritativePlans=[];
  const panel=document.querySelector('[role="tabpanel"][id$="-content-floor_plans"]');
  const planImages=panel?[...panel.querySelectorAll('img')].filter(x=>/^floor\s*plan\s+\d+/i.test(x.alt||'')):[];
  authoritativePlans=planImages.map(img=>{
   const set=img.closest('picture')?.querySelector('source')?.getAttribute('srcset')||'';
   return set.split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean).at(-1)||img.currentSrc||img.src;
  }).filter(Boolean);
 }
 if(authoritativePlans){plans.length=0;planSet.clear();for(const u of authoritativePlans)add(u,'floorplan')}
 if(!authoritativePhotos?.length)throw Error('The complete original listing gallery could not be read');
 if(authoritativePhotos){photos.length=0;photoSet.clear();for(const u of authoritativePhotos)add(u,'photo')}
 // Deduplicate floor plans out of the normal photo gallery.
 const floorPaths=new Set(plans.map(x=>new URL(x).pathname));
 const gallery=photos.filter(x=>!planSet.has(x)&&!floorPaths.has(new URL(x).pathname));
 if(!/£\s?[\d,]+/.test(mainText+' '+description)||!/(bedroom|beds|property type|house)/i.test(mainText+' '+description))throw new Error('Listing did not fully load');
 const priceRegion=(document.querySelector('h1')?.closest('section')?.innerText||'').slice(0,900);
 const priceInTitle=title.match(/£\s*(\d{1,3}(?:,\d{3})+|\d{6,7})(?:\.\d{2})?/);
 const priceOnPage=(mainText.slice(0,3200)+' '+priceRegion).match(/(?:^|\n)\s*(?:guide\s+price|offers\s+(?:in\s+excess\s+of|over)|asking\s+price|fixed\s+price|price)?\s*\n?\s*£\s*(\d{1,3}(?:,\d{3})+|\d{6,7})(?:\.\d{2})?/i);
 const priceMatch=priceOnPage||priceInTitle;
 const price=priceMatch?Number(priceMatch[1].replaceAll(',','')):null;
 const field=label=>{const m=mainText.match(new RegExp('(?:^|\\n)\\s*'+label+'\\s*(?:\\n|:)\\s*(\\d+)','i'));return m?Number(m[1]):null};
 const bedrooms=field('bedrooms?')||Number((description+' '+title).match(/(\d+)\s*(?:bedrooms?|beds?)/i)?.[1])||null;
 const bathrooms=field('bathrooms?')||Number((mainText.slice(0,5000)+' '+description+' '+title).match(/\b(\d+)\s*(?:baths?|bathrooms?|shower rooms?|wet rooms?)\b/i)?.[1])||null;
 const wcText=mainText+' '+description;
 const wcNumber=wcText.match(/\b(\d+)\s+(?:separate|downstairs|ground.floor)\s+(?:wcs?|toilets?|cloakrooms?)\b/i);
 const wcs=wcNumber?Number(wcNumber[1]):/\b(?:separate|downstairs|ground.floor)\s+(?:wc|toilet|cloakroom)\b/i.test(wcText)?1:null;
 const floorAreaPattern=/(?:total\s+)?(?:internal\s+)?(?:floor\s+(?:area|size|space)|gross\s+internal\s+area|living\s+area)\s*(?:of|:|-|approximately|approx\.?)*\s*([\d,.]+)\s*(sq\.?\s?ft|square\s+feet|sq\.?\s?m|sqm|m²)/ig;
 let area=null,match;
 for(const candidate of (mainText+'\n'+description).matchAll(floorAreaPattern)){
   const v=Number(candidate[1].replace(/,/g,''));if(v<=0)continue;const sqm=/ft|feet/i.test(candidate[2])?v*.09290304:v;
   if(sqm>=30&&sqm<2000){area=Math.round(sqm*10)/10;break}
 }

 // Zoopla's facts panel often prints bare "1,161 sq. ft" without a Floor Area label.
 // Its first main facts panel has precedence over any unrelated measurements lower down.
 if(area==null){
   const facts=mainText.slice(0,3800);
   const m=facts.match(/(?:^|\n)\s*([\d,]+)\s*(sq\.?\s*ft|square\s+feet|sq\.?\s*m|sqm|m²)\b/i);
   if(m){const v=Number(m[1].replace(/,/g,''));const sqm=/ft|feet/i.test(m[2])?v*0.09290304:v;
     if(sqm>=30&&sqm<=550)area=Math.round(sqm*100)/100}
 }

 // Only extract the garden's dimensions or description where the listing explicitly states them.
 const gardenText=(mainText+'\n'+description).replace(/\s+/g,' ');
 let gardenArea=null;
 const ga=gardenText.match(/\b(?:rear|private|back|south-facing|north-facing|landscaped)?\s*garden\s*(?:area|size|measuring|approximately|of|:)?\s*(\d+(?:\.\d+)?)\s*(?:m²|sqm|sq\.?\s*m|square metres)\b/i);
 if(ga){const n=Number(ga[1]);if(n>3&&n<3000)gardenArea=n}
 if(gardenArea==null){
   const gd=gardenText.match(/\b(?:rear|private|back)?\s*garden\s*(?:measuring|measures|of|approx\.?|approximately|:)?\s*(\d+(?:\.\d+)?)\s*(?:m|metres?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?)\b/i);
   if(gd){const n=Number(gd[1])*Number(gd[2]);if(n>3&&n<3000)gardenArea=Math.round(n*10)/10}
 }
 let gardenDescription='';
 const gs=gardenText.match(/\b(?:the\s+)?(?:rear garden|private garden|enclosed garden|south.facing garden|landscaped garden|garden measuring|garden with|garden provides|garden area)\b[^.!?]{0,200}[.!?]?/i);
 if(gs)gardenDescription=gs[0].slice(0,230);
 let floors=null;
 const floorHit=(mainText+' '+description).match(/\b([2-5])\s*(?:storey|storeys|story|stories|floors)\b|\b(two|three|four|five)[ -]storey\b/i);
 if(floorHit)floors=Number(floorHit[1])||({two:2,three:3,four:4,five:5}[floorHit[2]?.toLowerCase()]);
 // Room-by-room descriptions can establish the number of occupied floors.
 if(floors==null){
   const descriptionText=description+' '+mainText.slice(0,20000);
   if(/\bground floor\b/i.test(descriptionText)&&/\bfirst floor\b/i.test(descriptionText)){
     floors=/\bthird floor\b/i.test(descriptionText)?4:/\bsecond floor\b/i.test(descriptionText)?3:2;
   }
 }
 // If the listing has no explicit levels, let the actual floor-plan reader decide.
 const zone=mainText.match(/(?:nearest\s+(?:train\s+|railway\s+)?stations?|nearby\s+stations?|train\s+stations?|transport\s+links)\s*\n?([\s\S]{0,1200})/i)?.[1]||'';
 const stations=[];
 for(const sm of zone.matchAll(/(?:^|\n)\s*([A-Z][A-Za-z'& -]{2,55})(?:\s+|\s*\(|\s*[-–]\s*)(?:approx\.?\s*)?(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/gi)){
    const name=sm[1].trim();
    if(/^(?:nearby|nearest|station|distance|transport|walking|train|railway|underground|property)/i.test(name))continue;
    if(!stations.some(s=>s.name.toLowerCase()===name.toLowerCase()))stations.push({name});
    if(stations.length>=2)break;
 }
 const stationName=stations[0]?.name||'',station2Name=stations[1]?.name||'';
 // Listing-provided distances are usually straight-line distances and are NOT labelled as walking distances.
 // Do not copy those values into walking-distance fields.
 const stationMiles=null,station2Miles=null;
 let latitude=null,longitude=null;
 const joined=scripts.filter(x=>/latitude|longitude|"lat"|"lng"|"coordinates"/i.test(x)).slice(0,20).join('\n').slice(0,400000);
 const latHit=joined.match(/["'](?:latitude|lat)["']\s*:\s*["']?(-?5[01-9]\.\d+)/i);
 const lngHit=joined.match(/["'](?:longitude|lng|lon)["']\s*:\s*["']?(-?[0-9]\.\d+)/i);
 if(latHit&&lngHit){const la=Number(latHit[1]),lo=Number(lngHit[1]);if(la>49&&la<61&&lo>-9&&lo<3){latitude=la;longitude=lo}}
 const propertyType=mainText.match(/PROPERTY TYPE\s*\n+\s*([^\n]+)/i)?.[1]||'';
 const tenure=mainText.match(/TENURE\s*\n+\s*([^\n]+)/i)?.[1]||'';
 let address=(document.querySelector('h1')?.textContent||title).trim();
 address=address.replace(/^\s*\d+\s*bed(?:room)?s?\s+.*?\s+(?:for sale|to rent)\s*/i,'').replace(/^\s*property\s+for\s+sale\s*/i,'').replace(/\s*[-|]\s*(?:Zoopla|Rightmove).*$/i,'').trim();
 if(address.length>160)address=title.slice(0,160);
 if(!gallery.length)throw new Error('Listing loaded but house photographs were not found');
 return {listing_id:location.pathname.match(/\/(?:details|properties)\/(\d+)/)?.[1]||null,source,title,address,price,bedrooms,bathrooms,wc_count:wcs,floors,floor_area_sqm:area,garden_area_sqm:gardenArea,garden_description:gardenDescription,station_name:stationName,station_distance_miles:stationMiles,station_2_name:station2Name,station_2_distance_miles:station2Miles,latitude,longitude,property_type:propertyType,tenure,images:gallery,floorplans:plans,floorplan_status:plans.length?'found-in-original-listing':clickedPlanTab?'tab-opened-but-image-not-found':floorTab?'floorplan-tab-click-failed':'floorplan-tab-not-found',floorplan_diagnostic:{tabFound:!!floorTab,tabClicked:clickedPlanTab,candidateCount:plans.length,error:planTabError},extension_version:'0.9.0'};
}
async function extract(url){
 if(!validListing(url))throw new Error('URL must be a Zoopla or Rightmove individual property listing');
 let tab;
 try{
  tab=await chrome.tabs.create({url,active:false});await waitForLoad(tab.id);
  const expectedId=new URL(url).pathname.match(/\/(?:details|properties)\/(\d+)/)?.[1];
  const finalUrl=(await chrome.tabs.get(tab.id)).url||'';
  const finalId=new URL(finalUrl).pathname.match(/\/(?:details|properties)\/(\d+)/)?.[1];
  if(!expectedId||finalId!==expectedId)throw Error('The original listing is unavailable or redirected to another page');
  // Give the app's client-rendered listing content time to appear in the DOM.
  await new Promise(r=>setTimeout(r,1600));
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:readPropertyFromPage});
  const data=result?.[0]?.result,expected=new URL(url).pathname.match(/\/(?:details|properties)\/(\d+)/)?.[1];
  if(!data||!expected||data.listing_id!==expected)throw Error('The original listing is unavailable or redirected to another page');
  return data;
 }finally{if(tab?.id)await chrome.tabs.remove(tab.id).catch(()=>{})}
}
async function fetchImage(url){
 const u=new URL(url);
 if(u.protocol!=='https:'||!/(^|\.)(zoocdn\.com|rightmove\.co\.uk|zoopla\.co\.uk)$/.test(u.hostname))throw new Error('Image CDN host not in trusted allowlist: '+u.hostname);
 if(/\/(?:for-sale|to-rent)\/details\/\d+\/(?:true|false)?\/?$/i.test(u.pathname))throw new Error('Invalid floor-plan source: this is a Zoopla listing or boolean flag, not an image');
 const resp=await fetch(u.href,{redirect:'follow'});
 if(!resp.ok)throw new Error('Image download: '+resp.status);
 const mime=(resp.headers.get('content-type')||'image/jpeg').split(';')[0];
 if(!mime.startsWith('image/')&&mime!=='application/pdf')throw new Error('Not a supported image or PDF');
 const arr=new Uint8Array(await resp.arrayBuffer());
 if(arr.byteLength>5_000_000)throw new Error('Photo is larger than 5 MB');
 let binary='';for(let i=0;i<arr.length;i+=8192)binary+=String.fromCharCode(...arr.slice(i,i+8192));
 return {base64:btoa(binary),mime};
}
chrome.runtime.onMessage.addListener((req,sender,sendResponse)=>{
 if(!sender.url?.startsWith('https://sabinacoaching.github.io/our-house-hunt/'))return false;
 if(req.action==='PING'){sendResponse({ok:true,data:{extension:'Our House Hunt',version:'0.9.0'}});return false;}
 if(!['IMPORT_URL','FETCH_IMAGE'].includes(req.action))return false;
 (async()=>{try{const data=req.action==='IMPORT_URL'?await extract(req.url):await fetchImage(req.url);sendResponse({ok:true,data})}catch(e){sendResponse({ok:false,error:e.message})}})();
 return true;
});
