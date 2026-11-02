import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from '../public/transport.mjs';
import {createApp} from '../server.mjs';
import fs from 'node:fs';
import path from 'node:path';
test('旧后台404转换成可处理的重启说明',async()=>{const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(JSON.stringify({error:'接口不存在'}),{status:404,headers:{'Content-Type':'application/json'}});await assert.rejects(request('/api/batch-remove',{ids:[]},'test'),/旧版本.*停止工作台/);}finally{globalThis.fetch=original;}});
test('旧记录迁移后接口版本、180条批次任务和空移除请求保留数据',async t=>{const dir=fs.mkdtempSync(path.resolve('test-output/runtime-'));const tasks=Object.fromEntries(Array.from({length:180},(_,i)=>['t'+i,{id:'t'+i,folder:'C:/fixture',folderName:'fixture',importedAt:'2026-10-30T00:00:00Z',data:{任务编号:'T'+i,处理分类:'局部重绘-Gemini',参考图编号:[],具体要求:'',输出比例:null},errors:['测试'],assets:{}}]));fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({version:4,tasks,jobs:[]}));const app=createApp({dataDir:dir});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const before=app.snapshot();assert.equal(before.apiRevision,3);assert.equal(before.batches[0].taskIds.length,180);const res=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/batch-remove',{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':before.token},body:JSON.stringify({batchId:before.currentBatchId,ids:[]})});assert.equal(res.status,200);assert.deepEqual(await res.json(),{removed:0,skipped:0});assert.equal(app.snapshot().tasks.length,180);});
