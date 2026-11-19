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
 await page.locator('[data-trip-index][role="link"], [data-trip-index][role="button"]').nth(1).click();await page.waitForTimeout(1500);const details=page.getByText('Details',{exact:true});if(await details.count())await details.first().click();await page.waitForTimeout(3500);console.log('GOOGLE_DETAIL_TEXT',(await page.locator('body').innerText()).slice(0,12000));
}finally{await browser.close()}
