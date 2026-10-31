// A narrow bridge: the shared catalogue requests property extraction, never login credentials.
window.addEventListener('message', async event => {
  if(event.source!==window || event.origin!==location.origin || event.data?.source!=='our-house-hunt-site')return;
  const {id,action,url}=event.data;
  if(typeof id!=='string'||!['PING','IMPORT_URL','FETCH_IMAGE'].includes(action))return;
  try{
    const reply=await chrome.runtime.sendMessage({action,url});
    window.postMessage({source:'our-house-hunt-extension',id,...reply},location.origin);
  }catch(e){window.postMessage({source:'our-house-hunt-extension',id,ok:false,error:e.message},location.origin)}
});
