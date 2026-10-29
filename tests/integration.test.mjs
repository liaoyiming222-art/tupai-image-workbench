import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../server.mjs';
import {writeFixture,png} from '../scripts/fixtures.mjs';
import {secret} from '../lib/secrets.mjs';
const base=path.resolve('test-output');fs.mkdirSync(base,{recursive:true});
async function until(fn){for(let i=0;i<250;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,30));}throw new Error('等待任务超时');}
async function setup(t,actualKeys=false){
  const dir=fs.mkdtempSync(path.join(base,'integration-')),requests=[],submits=[],queries=[],downloads=[];
  let root='',failDownload=false,failSubmission=false;
  const mock=http.createServer(async(req,res)=>{
    const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();
    requests.push({url:req.url,key:req.headers.authorization,raw});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/openapi/v2/media/upload/binary'){res.end(JSON.stringify({code:0,data:{download_url:`${root}/input/${requests.length}`,fileName:`uploads/${requests.length}.png`}}));return;}
    if(req.url==='/openapi/v2/query'){queries.push(JSON.parse(raw));res.end(JSON.stringify({status:'SUCCESS',results:[{url:root+'/image.png',outputType:'png'}]}));return;}
    if(req.url==='/image.png'){downloads.push(req.url);if(failDownload){res.writeHead(503);res.end('{}');}else{res.setHeader('Content-Type','image/png');res.end(png());}return;}
    if(req.url.startsWith('/openapi/v2/')){submits.push({url:req.url,key:req.headers.authorization,body:JSON.parse(raw)});if(failSubmission){res.writeHead(503);res.end('{}');}else res.end(JSON.stringify({taskId:String(submits.length),status:'RUNNING'}));return;}
    res.writeHead(404);res.end('{}');
  });
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));root=`http://127.0.0.1:${mock.address().port}`;
  const app=createApp({dataDir:path.join(dir,'data'),baseUrl:root,pollInterval:10,folderPicker:async()=>dir,...(actualKeys?{}:{keyResolver:()=> 'shared-test-key'})});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`;
  const call=async(route,body)=>{const state=app.snapshot();const response=await fetch(url+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':state.token},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
  t.after(async()=>{await app.close();await new Promise(r=>mock.close(r));assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  assert.equal((await call('/api/settings',{concurrency:2})).status,200);
  if(actualKeys)assert.equal((await call('/api/account',{apiKey:'shared-test-key'})).status,200);
  assert.equal(app.snapshot().hasKey,true);
  assert.doesNotMatch(JSON.stringify(app.snapshot()),/shared-test-key|keyCipher|credentialCipher/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'data','state.json'),'utf8'),/shared-test-key/);
  return{dir,app,url,call,submits,queries,requests,downloads,setDownloadFailure:v=>{failDownload=v;},setSubmissionFailure:v=>{failSubmission=v;}};
}
test('完整链路：两类任务共享 Key、编号转换、null 自适应、正确文件夹回存、版本保护',async t=>{
  const ctx=await setup(t,true),a=path.join(ctx.dir,'需求A'),b=path.join(ctx.dir,'需求B');
  writeFixture(a);writeFixture(b,{category:'局部重绘-gpt',ratio:'4:5'});
  const original=fs.readFileSync(path.join(a,'作图需求.json'),'utf8');
  for(const provider of ctx.app.state().providers)provider.params={...provider.params,aspectRatio:'1:1',aspect_ratio:'16:9',ratio:'3:4'};
  await ctx.call('/api/import',{paths:[a,b]});
  const tasks=ctx.app.snapshot().tasks;assert.equal(tasks.length,2);
  assert.equal((await ctx.call('/api/start',{ids:tasks.map(t=>t.id)})).data.added,2);
  await until(()=>ctx.app.snapshot().jobs.length===2&&ctx.app.snapshot().jobs.every(j=>j.status==='completed'));
  assert.equal(ctx.submits.length,2);
  const nano=ctx.submits.find(r=>r.url==='/openapi/v2/rhart-image-n-g31-flash/image-to-image'),gpt=ctx.submits.find(r=>r.url==='/openapi/v2/rhart-image-g-2/image-to-image');assert.ok(nano);assert.ok(gpt);
  assert.ok(ctx.submits.every(row=>row.key==='Bearer shared-test-key'));
  assert.ok(ctx.requests.filter(row=>row.url.startsWith('/openapi/v2/')).every(row=>row.key==='Bearer shared-test-key'));
  assert.equal(nano.body.imageUrls.length,2);assert.match(nano.body.prompt,/@图片2/);assert.doesNotMatch(nano.body.prompt,/@图片3/);
  for(const field of ['aspectRatio','aspect_ratio','ratio'])assert.equal(field in nano.body,false);
  assert.equal(gpt.body.aspectRatio,'4:5');assert.equal('ratio' in gpt.body,false);
  assert.ok(fs.existsSync(path.join(a,'AI','T001_01.png')));assert.ok(fs.existsSync(path.join(b,'AI','T001_01.png')));
  assert.equal(fs.readFileSync(path.join(a,'作图需求.json'),'utf8'),original);
  const first=tasks.find(t=>t.folder===a);
  assert.equal((await ctx.call('/api/start',{ids:[first.id]})).data.added,0);
  assert.equal((await ctx.call('/api/start',{ids:[first.id],force:true})).data.added,1);
  await until(()=>ctx.app.snapshot().jobs[0].status==='completed'&&ctx.submits.length===3);
  assert.ok(fs.existsSync(path.join(a,'AI','T001_02.png')));
  const page=await(await fetch(ctx.url)).text();assert.doesNotMatch(page,/<img\b/);assert.match(page,/app.js/);
  assert.equal((await fetch(ctx.url+'/app.js')).status,200);
  const picked=await ctx.call('/api/pick-folder',{});
  assert.equal(picked.status,200);
  assert.equal(picked.data.path,ctx.dir);
});
test('下载失败只重试下载，不再次提交；远程任务编号持久保存',async t=>{
  const ctx=await setup(t),folder=path.join(ctx.dir,'需求');writeFixture(folder);await ctx.call('/api/import',{paths:[folder]});ctx.setDownloadFailure(true);
  await ctx.call('/api/start',{ids:ctx.app.snapshot().tasks.map(t=>t.id)});
  const failed=await until(()=>ctx.app.snapshot().jobs.find(j=>j.status==='failed'));
  assert.ok(failed.remoteId);assert.ok(failed.canResume);assert.equal(ctx.submits.length,1);
  assert.equal((await ctx.call('/api/start',{ids:ctx.app.snapshot().tasks.map(t=>t.id)})).data.added,0);
  ctx.setDownloadFailure(false);await ctx.call('/api/resume-job',{id:failed.id});
  await until(()=>ctx.app.snapshot().jobs[0].status==='completed');assert.equal(ctx.submits.length,1);assert.equal(ctx.queries.length,1);assert.equal(ctx.downloads.length,2);
});
test('提交结果不确定不会自动重发，重复导入也保持该状态',async t=>{
  const ctx=await setup(t),folder=path.join(ctx.dir,'需求');writeFixture(folder);await ctx.call('/api/import',{paths:[folder]});ctx.setSubmissionFailure(true);
  const id=ctx.app.snapshot().tasks[0].id;await ctx.call('/api/start',{ids:[id]});
  await until(()=>ctx.app.snapshot().jobs[0]?.status==='uncertain');
  await ctx.call('/api/import',{paths:[folder]});assert.equal(ctx.app.snapshot().tasks[0].status,'uncertain');
  assert.equal((await ctx.call('/api/start',{ids:[id]})).data.added,0);assert.equal(ctx.submits.length,1);
});
test('写入 API 需要本机令牌',async t=>{
  const ctx=await setup(t);const response=await fetch(ctx.url+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);
});
test('本机 API Key 加密往返且篡改会被拒绝',async t=>{
  const dir=fs.mkdtempSync(path.join(base,'secret-'));t.after(()=>{assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const cipher=await secret('runninghub-test-key-only',false,dir);assert.notEqual(cipher,'runninghub-test-key-only');assert.equal(await secret(cipher,true,dir),'runninghub-test-key-only');
  await assert.rejects(secret(cipher.slice(0,-4)+'AAAA',true,dir),/无法解密/);
});
test('仅填写一个账户 Key，空值保留、主动清除，接口与分类保持内置配置',async t=>{
  const ctx=await setup(t,true);
  const original=ctx.app.snapshot(),result=await ctx.call('/api/account',{apiKey:'new-shared-key',baseUrl:'https://example.invalid',providers:[]});
  assert.equal(result.status,200);
  const snapshot=ctx.app.snapshot();
  assert.equal(snapshot.baseUrl,original.baseUrl);
  assert.equal(snapshot.hasKey,true);
  const nano=snapshot.providers.find(p=>p.id==='gemini'),gpt=snapshot.providers.find(p=>p.id==='gpt');
  assert.equal(nano.submitPath,'/openapi/v2/rhart-image-n-g31-flash/image-to-image');
  assert.equal(gpt.submitPath,'/openapi/v2/rhart-image-g-2/image-to-image');
  assert.deepEqual(nano.params,{resolution:'1k'});assert.deepEqual(gpt.params,{resolution:'1k'});
  assert.equal(snapshot.bindings['局部重绘-Gemini'],'gemini');assert.equal(snapshot.bindings['局部重绘-gpt'],'gpt');
  assert.equal(await secret(ctx.app.state().keyCipher,true,path.join(ctx.dir,'data')),'new-shared-key');
  for(const provider of ctx.app.state().providers)assert.equal(Object.hasOwn(provider,'keyCipher'),false);
  assert.doesNotMatch(JSON.stringify(snapshot),/new-shared-key|keyCipher|credentialCipher/);
  const cipher=ctx.app.state().keyCipher;
  assert.equal((await ctx.call('/api/account',{apiKey:''})).status,200);
  assert.equal(ctx.app.state().keyCipher,cipher);
  assert.equal(ctx.app.snapshot().hasKey,true);
  assert.equal((await ctx.call('/api/account',{clearKey:true})).status,200);
  assert.equal(ctx.app.snapshot().hasKey,false);
  assert.equal(ctx.app.state().keyCipher,'');
  assert.deepEqual(ctx.app.snapshot().providers,snapshot.providers);
});

test('手选模型覆盖分类，状态预览与实际调用一致且不改原需求文档',async t=>{
  const ctx=await setup(t,true),a=path.join(ctx.dir,'Gemini分类'),b=path.join(ctx.dir,'gpt分类');
  writeFixture(a);writeFixture(b,{category:'局部重绘-gpt'});
  const originals=[a,b].map(folder=>fs.readFileSync(path.join(folder,'作图需求.json'),'utf8'));
  await ctx.call('/api/import',{paths:[a,b]});
  const tasks=ctx.app.snapshot().tasks,first=tasks.find(task=>task.folder===a),second=tasks.find(task=>task.folder===b);
  assert.equal(first.providerId,'gemini');assert.equal(second.providerId,'gpt');
  const preview=await ctx.call('/api/state?modelChoice=gpt');
  assert.equal(preview.status,200);assert.ok(preview.data.tasks.every(task=>task.providerId==='gpt'));
  const inverse=await ctx.call('/api/state?modelChoice=gemini');
  assert.equal(inverse.status,200);assert.ok(inverse.data.tasks.every(task=>task.providerId==='gemini'));
  assert.equal((await ctx.call('/api/state?modelChoice=unknown')).status,400);
  assert.equal((await ctx.call('/api/start',{ids:[first.id],modelChoice:'gpt'})).data.added,1);
  assert.equal((await ctx.call('/api/start',{ids:[second.id],modelChoice:'gemini'})).data.added,1);
  await until(()=>ctx.app.snapshot().jobs.length===2&&ctx.app.snapshot().jobs.every(job=>job.status==='completed'));
  assert.equal(ctx.app.state().jobs.find(job=>job.taskId===first.id).provider.id,'gpt');
  assert.equal(ctx.app.state().jobs.find(job=>job.taskId===second.id).provider.id,'gemini');
  assert.deepEqual(new Set(ctx.submits.map(row=>row.url)),new Set(['/openapi/v2/rhart-image-g-2/image-to-image','/openapi/v2/rhart-image-n-g31-flash/image-to-image']));
  assert.ok(ctx.submits.every(row=>row.key==='Bearer shared-test-key'));
  for(const [index,folder] of [a,b].entries())assert.equal(fs.readFileSync(path.join(folder,'作图需求.json'),'utf8'),originals[index]);
});

test('切换到不支持需求比例的模型，在上传前拒绝并提供预览错误',async t=>{
  const ctx=await setup(t),folder=path.join(ctx.dir,'超宽比例需求');writeFixture(folder,{ratio:'8:1'});
  await ctx.call('/api/import',{paths:[folder]});const id=ctx.app.snapshot().tasks[0].id;
  const auto=await ctx.call('/api/state?modelChoice=auto');
  assert.equal(auto.data.tasks[0].providerId,'gemini');assert.deepEqual(auto.data.tasks[0].configErrors,[]);
  const preview=await ctx.call('/api/state?modelChoice=gpt');
  assert.equal(preview.data.tasks[0].providerId,'gpt');assert.ok(preview.data.tasks[0].configErrors.some(error=>/比例/.test(error)));
  const rejected=await ctx.call('/api/start',{ids:[id],modelChoice:'gpt'});
  assert.equal(rejected.data.added,0);assert.ok(rejected.data.skipped.some(error=>/比例/.test(error)));
  assert.equal(ctx.app.snapshot().jobs.length,0);assert.equal(ctx.requests.length,0);
  assert.equal((await ctx.call('/api/start',{ids:[id],modelChoice:'auto'})).data.added,1);
  await until(()=>ctx.app.snapshot().jobs[0]?.status==='completed');
  assert.equal(ctx.submits[0].url,'/openapi/v2/rhart-image-n-g31-flash/image-to-image');
  assert.equal(ctx.submits[0].body.aspectRatio,'8:1');
});

test('已入队任务保留当时模型与 Key，之后切换和更新 Key 只影响新任务',async t=>{
  const ctx=await setup(t,true),a=path.join(ctx.dir,'先入队'),b=path.join(ctx.dir,'后入队');
  writeFixture(a);writeFixture(b,{category:'局部重绘-gpt'});
  await ctx.call('/api/import',{paths:[a,b]});
  const first=ctx.app.snapshot().tasks.find(task=>task.folder===a),second=ctx.app.snapshot().tasks.find(task=>task.folder===b);
  ctx.app.state().concurrency=0;
  assert.equal((await ctx.call('/api/start',{ids:[first.id],modelChoice:'gpt'})).data.added,1);
  const queued=ctx.app.state().jobs[0],oldCipher=queued.credentialCipher;
  assert.equal(queued.status,'queued');assert.equal(queued.provider.id,'gpt');
  assert.equal(await secret(oldCipher,true,path.join(ctx.dir,'data')),'shared-test-key');
  assert.equal((await ctx.call('/api/account',{apiKey:'updated-shared-key'})).status,200);
  const changedPreview=await ctx.call('/api/state?modelChoice=gemini');
  assert.ok(changedPreview.data.tasks.every(task=>task.providerId==='gemini'));
  assert.equal((await ctx.call('/api/start',{ids:[second.id],modelChoice:'gemini'})).data.added,1);
  assert.equal(queued.provider.id,'gpt');assert.equal(queued.credentialCipher,oldCipher);
  assert.equal(ctx.requests.length,0);
  const later=ctx.app.state().jobs.find(job=>job.taskId===second.id);
  assert.equal(later.provider.id,'gemini');assert.equal(await secret(later.credentialCipher,true,path.join(ctx.dir,'data')),'updated-shared-key');
  assert.doesNotMatch(JSON.stringify(ctx.app.snapshot()),/shared-test-key|updated-shared-key|keyCipher|credentialCipher/);
  ctx.app.state().concurrency=2;
  assert.equal((await ctx.call('/api/pause',{paused:false})).status,200);
  await until(()=>ctx.app.snapshot().jobs.every(job=>job.status==='completed'));
  assert.equal(ctx.submits.length,2);
  const originalSubmit=ctx.submits.find(row=>row.url==='/openapi/v2/rhart-image-g-2/image-to-image');
  const laterSubmit=ctx.submits.find(row=>row.url==='/openapi/v2/rhart-image-n-g31-flash/image-to-image');
  assert.equal(originalSubmit.key,'Bearer shared-test-key');assert.equal(laterSubmit.key,'Bearer updated-shared-key');
  const queryRequests=ctx.requests.filter(row=>row.url==='/openapi/v2/query');
  assert.equal(queryRequests.find(row=>JSON.parse(row.raw).taskId===String(ctx.submits.indexOf(originalSubmit)+1)).key,'Bearer shared-test-key');
  assert.equal(queryRequests.find(row=>JSON.parse(row.raw).taskId===String(ctx.submits.indexOf(laterSubmit)+1)).key,'Bearer updated-shared-key');
});
