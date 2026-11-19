import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({locale:'en-GB',timezoneId:'Europe/London'});
try{
 await page.goto('https://www.google.com/maps/dir/51.4032072%2C-0.1495626/63%20Upper%20Richmond%20Road%2C%20London%20SW15%202RD/data=!4m6!4m5!2m3!6e1!7e2!8j1795549800!3e3?hl=en',{waitUntil:'domcontentloaded',timeout:45000});
 const reject=page.locator('button[aria-label*="Reject all" i]');if(await reject.count())await reject.first().click().catch(()=>{});
 await page.locator('[data-trip-index][role="link"], [data-trip-index][role="button"]').first().waitFor({timeout:40000});
 await page.waitForTimeout(2000);
 const rows=await page.locator('[data-trip-index][role="link"], [data-trip-index][role="button"]').evaluateAll(nodes=>nodes.slice(0,4).map(n=>({text:n.innerText,aria:n.getAttribute('aria-label'),icons:[...n.querySelectorAll('[aria-label],img[alt]')].map(x=>({tag:x.tagName,label:x.getAttribute('aria-label'),alt:x.getAttribute('alt')})),html:n.outerHTML.slice(0,20000)})));
 console.log('GOOGLE_CARDS',JSON.stringify(rows));
 const captured=await page.evaluate(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));const c=[...document.querySelectorAll('[data-trip-index][role="link"], [data-trip-index][role="button"]')][3];c.click();await wait(1800);const d=[...document.querySelectorAll('button,[role="button"],a')].find(n=>(n.innerText||'').trim()==='Details');if(d)d.click();await wait(3500);const text=document.body.innerText;return {walks:[...text.matchAll(/Walk\\s+[^\\n]*\\n\\s*(?:About\\s+)?(\\d+)\\s*min/gi)].map(x=>Number(x[1])),text:text.slice(0,9000)} });console.log('EVALUATE_DETAILS',JSON.stringify(captured));
}finally{await browser.close()}
