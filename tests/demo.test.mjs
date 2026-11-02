import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {request,viewerUrl,thumbnailUrl,isDemo} from '../demo/src/transport.mjs';
test('演示版模拟队列、暂停恢复、编号转换和重置，不发出网络请求',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let now=originalNow();Date.now=()=>now;
 globalThis.fetch=()=>{throw Error('演示版不得访问网络');};
 try{
  assert.equal(isDemo,true);await request('/api/demo-reset',{});
  let s=await request('/api/state');assert.equal(s.tasks.length,4);assert.equal(s.jobs.length,2);
  const ready=s.tasks.filter(t=>t.status==='ready');assert.equal(ready.length,2);
  assert.equal(ready[0].plan.mapping[1].local,'图片2');assert.doesNotMatch(ready[0].plan.prompt,/@图片3/);
  assert.equal((await request('/api/start',{ids:ready.map(t=>t.id),modelChoice:'gpt'})).added,2);
  s=await request('/api/state?modelChoice=gpt');assert.equal(s.active,1);assert.equal(s.jobs[0].providerName,'GPT Image 2.0');
  await request('/api/pause',{paused:true});now+=9000;s=await request('/api/state');assert.ok(s.jobs.some(j=>j.status==='completed'));assert.ok(s.jobs.some(j=>j.status==='queued'));assert.equal(s.active,0);
  await request('/api/pause',{paused:false});s=await request('/api/state');assert.equal(s.active,1);now+=9000;await request('/api/state');
  const failed=s.jobs.find(j=>j.canResume);await request('/api/resume-job',{id:failed.id});now+=2000;s=await request('/api/state');assert.equal(s.jobs.find(j=>j.id===failed.id).status,'completed');
  assert.match(viewerUrl(s.jobs[0],true),/^\/demo-viewer.html\?scene=/);assert.match(thumbnailUrl(s.tasks[0]),/^\/assets\//);
  await request('/api/demo-reset',{});s=await request('/api/state');assert.equal(s.jobs.length,2);
  await assert.rejects(request('/api/override',{id:s.tasks[1].id,prompt:'参考@图片99。'}),/不在本次输入/);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});
test('演示部署目录仅包含静态演示内容，不包含本地服务和凭据',()=>{
 const config=JSON.parse(fs.readFileSync('demo/vercel.json'));assert.equal(config.framework,null);assert.equal(config.outputDirectory,'public');
 assert.ok(!fs.existsSync('demo/public/server.mjs'));assert.ok(!fs.existsSync('demo/public/.local'));
 const source=fs.readFileSync('demo/public/transport.mjs','utf8');assert.doesNotMatch(source,/\bfetch\s*\(|localStorage|indexedDB|apiKey\s*:/);
 assert.match(fs.readFileSync('demo/public/index.html','utf8'),/在线演示版/);
 assert.match(fs.readFileSync('demo/public/index.html','utf8'),/使用示例素材与模拟结果/);
 assert.equal(JSON.parse(fs.readFileSync('package.json')).license,'UNLICENSED');
});

test('新版演示支持多目录导入、历史筛选与看板，移除列表保留执行历史',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('演示版不得访问网络');};
 try{
  await request('/api/demo-reset',{});
  const folders=await request('/api/clipboard-folders',{});assert.equal(folders.entries.length,2);
  const before=await request('/api/history');assert.equal(before.total,2);
  await request('/api/import',{paths:[folders.paths[0]]});
  const state=await request('/api/state'),batch=state.batches.find(b=>b.id===state.currentBatchId);
  assert.equal(batch.taskIds.length,2);assert.equal(state.batches.length,2);
  const failed=await request('/api/history?status=failed&model=gpt');assert.equal(failed.total,1);
  assert.equal((await request('/api/job?id='+failed.jobs[0].id)).canResume,true);
  await request('/api/time-setting',{minutes:12});const report=await request('/api/dashboard');
  assert.equal(report.images,1);assert.equal(report.minutes,12);assert.equal(report.submissions,2);
  await request('/api/batch-remove',{batchId:state.currentBatchId,all:true});
  assert.equal((await request('/api/state')).batches.at(-1).taskIds.length,0);
  assert.equal((await request('/api/history')).total,2);
 }finally{globalThis.fetch=originalFetch;await request('/api/demo-reset',{});}
});
