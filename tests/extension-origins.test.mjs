import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('the importer supports both House Hunt paths and rejects unrelated sites',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 const matches=manifest.content_scripts[0].matches;
 let listener;
 const context=vm.createContext({URL,chrome:{runtime:{onMessage:{addListener(fn){listener=fn}}}}});
 vm.runInContext(readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),context);
 for(const path of ['our-house-hunt','Our-house-hunt']){
  assert.ok(matches.includes(`https://sabinacoaching.github.io/${path}/*`));
  let response;
  listener({action:'PING'},{url:`https://sabinacoaching.github.io/${path}/`},r=>{response=r});
  assert.equal(response?.ok,true);
 }
 let received=false;
 listener({action:'PING'},{url:'https://sabinacoaching.github.io.evil.example/Our-house-hunt/'},()=>{received=true});
 assert.equal(received,false);
});
