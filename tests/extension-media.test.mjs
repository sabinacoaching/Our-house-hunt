import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function runPage({host,path,body,script='',buttons=[],query=()=>null}){
 const h1={textContent:'2 bedroom house for sale Test Road, London',closest:()=>null};
 const document={body:{innerText:body},title:'2 bedroom house for sale Test Road, London',querySelector:s=>s==='h1'?h1:query(s),querySelectorAll:s=>s==='script'?[{textContent:script}]:s==='button'?buttons:s.startsWith('button,')?buttons.filter(b=>b.floor):[]};
 const c=vm.createContext({document,location:{hostname:host,pathname:path},URL,console,performance:{getEntriesByType:()=>[]},setTimeout:fn=>{fn();return 1},clearTimeout(){},chrome:{runtime:{onMessage:{addListener(){}}}}});
 return vm.runInContext(source+';readPropertyFromPage()',c);
}
const image=(url,alt='')=>({alt,currentSrc:url,src:url,closest:()=>({querySelector:()=>({getAttribute:()=>url+' 1200w'})})});
test('Rightmove media come from the matching listing model in source order',async()=>{
 const a='https://media.rightmove.co.uk/property-photo/a.jpeg',b='https://media.rightmove.co.uk/property-photo/b.jpeg',plan='https://media.rightmove.co.uk/floorplan/c.jpeg';
 const nodes=[{propertyData:1},{id:2,images:3,floorplans:4},'12345',[5,7],[9],{url:6},a,{url:8},b,{url:10},plan];
 const script='window.__PAGE_MODEL = '+JSON.stringify({data:JSON.stringify(nodes)})+';';
 const result=await runPage({host:'www.rightmove.co.uk',path:'/properties/12345',body:'£550,000\n2 bedroom house',script});
 assert.deepEqual(Array.from(result.images),[a,b]);assert.deepEqual(Array.from(result.floorplans),[plan]);
});
test('Zoopla captures the gallery panel and its specifically labelled plan',async()=>{
 const a='https://lid.zoocdn.com/u/1200/900/a.jpg',b='https://lid.zoocdn.com/u/1200/900/b.jpg',plan='https://lid.zoocdn.com/u/1200/900/p.jpg';
 let panel='';const photo={textContent:'2 Photos',innerText:'2 Photos',click(){panel='images'},getAttribute:()=>''};
 const floor={floor:true,textContent:'Floor plans',innerText:'Floor plans',click(){panel='floorplans'},getAttribute:()=>''};
 const query=s=>s.includes('-content-images')&&panel==='images'?{querySelectorAll:()=>[image(a),image(b)]}:s.includes('-content-floor_plans')&&panel==='floorplans'?{querySelectorAll:()=>[image(plan,'Floor plan 1 of 1')]}:null;
 const result=await runPage({host:'www.zoopla.co.uk',path:'/for-sale/details/123',body:'£500,000\n2 bedroom house',buttons:[photo,floor],query});
 assert.deepEqual(Array.from(result.images),[a,b]);assert.deepEqual(Array.from(result.floorplans),[plan]);
});
test('Zoopla reads the original listing media model without opening a gallery',async()=>{
 const listing={listingId:123,propertyImage:[{filename:'first.jpg'},{filename:'second.jpg'}],floorPlan:{image:[{filename:'plan.jpg'}]}};
 const rsc='7d:'+JSON.stringify(['$', 'div',null,{children:listing}])+'\n';
 const script='self.__next_f.push('+JSON.stringify([1,rsc])+')';
 const result=await runPage({host:'www.zoopla.co.uk',path:'/for-sale/details/123',body:'£500,000\n2 bedroom house',script});
 assert.deepEqual(Array.from(result.images),['https://lid.zoocdn.com/u/1200/900/first.jpg','https://lid.zoocdn.com/u/1200/900/second.jpg']);
 assert.deepEqual(Array.from(result.floorplans),['https://lid.zoocdn.com/u/1200/900/plan.jpg']);
});
