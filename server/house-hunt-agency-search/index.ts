import {createClient} from 'npm:@supabase/supabase-js@2.49.8';
import {parseSearchResponse,selectAgencyWebsite} from './select.js';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://sabinacoaching.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return respond({});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 if(!token)return respond({error:'Sign in required'},401);
 const who=await admin.auth.getUser(token);
 if(who.error||!who.data.user)return respond({error:'Invalid session'},401);
 const member=await admin.from('members').select('id').eq('id',who.data.user.id).maybeSingle();
 if(member.error||!member.data)return respond({error:'Not a household member'},403);
 let input:any;try{input=await req.json()}catch{return respond({error:'Invalid request'},400)}
 const name=typeof input?.name==='string'?input.name.trim().slice(0,150):'';
 const address=typeof input?.address==='string'?input.address.trim().slice(0,250):'';
 if(!name||!address)return respond({error:'Agency name and branch address are required'},400);
 try{
  const r=await fetch('https://api.you.com/mcp?profile=free',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'you-search',arguments:{query:name+' '+address+' estate agents',count:10,extraction:'none'}}}),signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('Search HTTP '+r.status);
  const website=selectAgencyWebsite(name,address,parseSearchResponse(await r.text()));
  return respond({website});
 }catch(e){return respond({error:'Agency search unavailable'},502)}
});
