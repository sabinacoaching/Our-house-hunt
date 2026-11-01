import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function run({sourceSite,description='',email=null,withLogo=true}){
 const isZoopla=sourceSite==='Zoopla';
 const photo=isZoopla?'https://lid.zoocdn.com/u/1200/900/first.jpg':'https://media.rightmove.co.uk/property-photo/a.jpeg';
 const listing={listingId:123,propertyImage:[{filename:'first.jpg'}],floorPlan:{image:[]}};
 const rsc='7d:'+JSON.stringify(['$','div',null,{children:listing}])+'\n';
 const nodes=[{propertyData:1},{id:2,images:3,floorplans:4},'123',[5],[],{url:6},photo];
 const script=isZoopla?'self.__next_f.push('+JSON.stringify([1,rsc])+')':'window.__PAGE_MODEL = '+JSON.stringify({data:JSON.stringify(nodes)})+';';
 const logo={alt:'Logo of Example Estate Agents',closest:()=>({querySelectorAll:()=>email?[{getAttribute:()=>`mailto:${email}?subject=house`}]:[]})};
 const h1={textContent:'2 bedroom house for sale Test Road, London',closest:()=>null};
 const document={body:{innerText:'£500,000\n2 bedroom house'},title:'2 bedroom house for sale Test Road, London',querySelector:s=>s==='h1'?h1:s.includes('og:description')?{content:description}:null,querySelectorAll:s=>s==='script'?[{textContent:script}]:s==='img[alt^="Logo of "]'&&isZoopla&&withLogo?[logo]:[]};
 const context=vm.createContext({document,location:{hostname:isZoopla?'www.zoopla.co.uk':'www.rightmove.co.uk',pathname:isZoopla?'/for-sale/details/123':'/properties/123'},URL,console,performance:{getEntriesByType:()=>[]},setTimeout:fn=>{fn();return 1},clearTimeout(){},chrome:{runtime:{onMessage:{addListener(){}}}}});
 return vm.runInContext(source+';readPropertyFromPage()',context);
}
test('Zoopla imports the listing agent and an email explicitly in its agent section',async()=>{
 const p=await run({sourceSite:'Zoopla',email:'homes@example.com'});
 assert.equal(p.agency_name,'Example Estate Agents');assert.equal(p.agency_email,'homes@example.com');assert.equal(p.agency_website,null);
});
test('Rightmove imports the agent named in its listing description without inventing an email',async()=>{
 const p=await run({sourceSite:'Rightmove',description:'2 bedroom house. Marketed by Oakhill, Isleworth'});
 assert.equal(p.agency_name,'Oakhill, Isleworth');assert.equal(p.agency_email,null);assert.equal(p.agency_website,null);
});
test('missing Zoopla agent section does not invent a name or an email',async()=>{
 const p=await run({sourceSite:'Zoopla',withLogo:false});
 assert.equal(p.agency_name,null);assert.equal(p.agency_email,null);
});
test('branch address is read from the matching agent profile',async()=>{
 const doc={title:'Oakhill, Isleworth',body:{innerText:'Oakhill, Isleworth\n6 South Street Isleworth Middlesex TW7 7BG'},querySelector:s=>s==='h1'?{innerText:'Oakhill, Isleworth'}:null,querySelectorAll:()=>[{innerText:'6 South Street, Isleworth, Middlesex TW7 7BG'}]};
 const c=vm.createContext({document:doc,URL,console,chrome:{runtime:{onMessage:{addListener(){}}}}});
 vm.runInContext(source,c);
 assert.equal(await vm.runInContext(`readAgencyProfile('Oakhill, Isleworth')`,c),'6 South Street, Isleworth, Middlesex TW7 7BG');
 assert.equal(await vm.runInContext(`readAgencyProfile('Dexters - Isleworth')`,c),null);
});
