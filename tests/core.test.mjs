import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {planTask,readFolder,discover,fillTemplate} from '../lib/core.mjs';
import {writeFixture,png} from '../scripts/fixtures.mjs';
const base=path.resolve('test-output');fs.mkdirSync(base,{recursive:true});
function sandbox(t){const dir=fs.mkdtempSync(path.join(base,'core-'));t.after(()=>{assert.ok(dir.startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
test('图片编号同时映射，不发生级联替换或 1/10 前缀误匹配',()=>{
  const task={errors:[],assets:{图片8:'8.png',图片1:'1.png',图片10:'10.png'},data:{要处理的图片:'图片8',参考图编号:['图片1','图片10','图片1'],具体要求:'保持@图片8，参考@图片1和@图片10，宽度1000。',输出比例:null}};
  const plan=planTask(task,{promptTemplate:'{{prompt}}'});
  assert.deepEqual(plan.mapping.map(r=>[r.global,r.local]),[['图片8','图片1'],['图片1','图片2'],['图片10','图片3']]);
  assert.match(plan.prompt,/保持@图片1，参考@图片2和@图片3，宽度1000/);
  assert.doesNotMatch(plan.prompt,/输出图片比例/);
  assert.equal(task.data.具体要求,'保持@图片8，参考@图片1和@图片10，宽度1000。');
});
test('模板引用不在输入中的图片会阻止运行',()=>{
  const task={errors:[],assets:{图片1:'1.png'},data:{要处理的图片:'图片1',参考图编号:[],具体要求:'修改@图片1。',输出比例:'4:5'}};
  assert.throws(()=>planTask(task,{promptTemplate:'参考@图片3，{{prompt}}'}),/不在本次输入/);
  assert.match(planTask(task,{promptTemplate:'{{prompt}}',referenceStyle:'ordinal'}).prompt,/第1张输入图片/);
});
test('读取六字段 JSON，识别缺图、重复图号和错误正文引用',t=>{
  const dir=sandbox(t);writeFixture(dir);let task=readFolder(dir)[0];assert.deepEqual(task.errors,[]);
  fs.writeFileSync(path.join(dir,'原图','图片1.jpg'),png());
  assert.ok(readFolder(dir)[0].errors.some(x=>x.includes('序号重复')));
  fs.unlinkSync(path.join(dir,'原图','图片1.jpg'));fs.unlinkSync(path.join(dir,'原图','图片3.png'));
  assert.ok(readFolder(dir)[0].errors.some(x=>x.includes('找不到素材')));
});
test('跨文件夹同任务编号独立，单文件重复任务编号保留错误行',t=>{
  const dir=sandbox(t),a=path.join(dir,'A'),b=path.join(dir,'B');writeFixture(a);writeFixture(b);
  assert.notEqual(readFolder(a)[0].id,readFolder(b)[0].id);
  const file=path.join(a,'作图需求.json'),data=JSON.parse(fs.readFileSync(file));data.作图需求.push({...data.作图需求[0]});fs.writeFileSync(file,JSON.stringify(data));
  const rows=readFolder(a);assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);assert.ok(rows.every(r=>r.errors.includes('任务编号重复')));
  assert.equal(discover(dir).folders.length,2);
});
test('工作流变量替换保留 null 和数组类型',()=>{
  const result=fillTemplate({ratio:'{{ratio}}',images:'{{images}}',text:'A {{prompt}}'},{ratio:null,images:['a','b'],prompt:'文字'});
  assert.deepEqual(result,{ratio:null,images:['a','b'],text:'A 文字'});
});
