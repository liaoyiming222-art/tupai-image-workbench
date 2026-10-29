import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {writeFixture} from '../scripts/fixtures.mjs';
import {thumbnail} from '../lib/folder-picker.mjs';
test('缩略图缓存、居中查看页和打开目录的错误反馈',async t=>{
 const base=path.resolve('test-output');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'ui-')),folder=path.join(dir,'需求');writeFixture(folder);
 const opened=[];const app=createApp({dataDir:path.join(dir,'data'),folderOpener:async p=>{opened.push(p);if(opened.length===3)throw Error('打开失败');}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
 const post=async(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':app.snapshot().token},body:JSON.stringify(body)});
 await post('/api/import',{paths:[folder]});const task=app.snapshot().tasks[0];
 for(const output of [false,true])assert.equal((await post('/api/open-folder',{id:task.id,output})).status,200);
 assert.deepEqual(opened,[folder,path.join(folder,'AI')]);assert.equal((await post('/api/open-folder',{id:task.id})).status,400);
 const view=await fetch(url+'/viewer?task='+task.id+'&image='+encodeURIComponent('图片1'));assert.equal(view.status,200);assert.match(await view.text(),/viewer.css/);
 assert.match(await (await fetch(url+'/viewer.css')).text(),/place-items:center/);
 if(process.platform==='win32'){
  const file=path.join(folder,'原图','图片1.png'),cache=await thumbnail(file,path.join(dir,'data')),mtime=fs.statSync(cache).mtimeMs;
  assert.equal(fs.readFileSync(cache)[0],255);assert.equal(await thumbnail(file,path.join(dir,'data')),cache);assert.equal(fs.statSync(cache).mtimeMs,mtime);
  const small=await fetch(url+'/api/thumbnail?task='+task.id+'&image='+encodeURIComponent('图片1'));assert.match(small.headers.get('content-type'),/image\/jpeg/);assert.ok((await small.arrayBuffer()).byteLength<15000);
 }
 assert.equal((await fetch(url+'/api/thumbnail?task='+task.id+'&image=not-found')).status,400);
});
