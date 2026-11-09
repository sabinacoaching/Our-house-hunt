// Read-only network check. Uses the production Edge handler and mocked database
// access; no Supabase credentials or writes are used.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=readFileSync(new URL('../server/house-hunt-station-commutes/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const code=stripTypeScriptTypes(source,{mode:'strip'});
const points=[
 ['Alpine Close',51.3694953,-.0883864],
 ['Lyncroft Gardens',51.4631369,-.3552057],
 ['Rossindel Road',51.4621708,-.3708626]
];
for(const [address,latitude,longitude] of points){
 let handler;
 const id='00000000-0000-4000-8000-000000000001';
 const p={id,latitude,longitude,station_name:'',station_2_name:'',station_3_name:null,station_commutes:{},manual_overrides:{}};
 const admin={auth:{getUser:async()=>({data:{user:{id:'test'}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:p}),maybeSingle:async()=>({data:{id:'test'}}),update(){throw Error('Network check must not write')}})};
 const requests=[];
 const realFetch=async(url,options)=>{
  const start=Date.now();
  try {const response=await fetch(url,options);requests.push({url:String(url),status:response.status,ms:Date.now()-start});return response}
  catch(error){requests.push({url:String(url),error:String(error),ms:Date.now()-start});throw error}
 };
 new Function('Deno','createClient','fetch',code)({env:{get:()=>''},serve:fn=>handler=fn},()=>admin,realFetch);
 const start=Date.now();
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({id,preview:true,discover:true,latitude,longitude})}));
 console.log(JSON.stringify({address,status:response.status,ms:Date.now()-start,result:await response.json(),requests},null,2));
}
