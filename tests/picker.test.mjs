import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildPicker} from '../lib/folder-picker.mjs';
import {createApp} from '../server.mjs';
import {secret} from '../lib/secrets.mjs';
const exec=promisify(execFile);
test('原生目录组件可直接运行，不启动脚本解释器', {skip:process.platform!=='win32'},async()=>{
  const binary=await buildPicker();
  const {stdout}=await exec(binary,['--self-test'],{windowsHide:true,timeout:10000});
  assert.equal(stdout,'NATIVE_FOLDER_PICKER_READY');
});
test('旧版配置迁移到指定模型，并保留已有凭据',async t=>{
  const base=path.resolve('test-output');fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'migration-'));
  const keyCipher=await secret('shared-migration-test',false,dir);
  fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({version:2,baseUrl:'https://www.runninghub.cn',providers:[{id:'gemini',name:'旧 Nano Pro',keyCipher},{id:'gpt',name:'旧 GPT 稳定版',keyCipher}],bindings:{'局部重绘-Gemini':'gemini','局部重绘-gpt':'gpt'},tasks:{},jobs:[]}));
  const app=createApp({dataDir:dir});
  t.after(async()=>{await app.close();assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  assert.equal(await secret(app.state().keyCipher,true,dir),'shared-migration-test');
  assert.equal(app.snapshot().hasKey,true);
  assert.ok(app.state().providers.every(p=>!p.keyCipher));
  assert.equal(app.snapshot().providers.find(p=>p.id==='gemini').name,'Nano Banana 2');
  assert.equal(app.snapshot().baseUrl,'https://www.runninghub.ai');
});
