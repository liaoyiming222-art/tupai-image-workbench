import {planTask} from '../../lib/task-plan.mjs';
import {defaultProviders,MODEL_BINDINGS} from '../../lib/catalog.mjs';
export const isDemo=true;
const root='/示例需求',profiles=defaultProviders();
let tasks,jobs,hasKey,paused,serial;
const names=['客厅_窗帘调整','餐厅_画面扩展'];
function createTask(i){
 const folderName=names[i<2?0:1],category=i%2?'局部重绘-gpt':'局部重绘-Gemini';
 return{id:'demo-task-'+i,folder:root+'/'+folderName,folderName,fingerprint:'demo-'+i,errors:[],assets:{图片1:'演示主图',图片3:'演示参考图'},data:{任务编号:'T00'+(i%2+1),处理分类:category,要处理的图片:'图片1',参考图编号:['图片3'],具体要求:i%2?'扩图，保持@图片1中的桌子在画面中心，窗帘形状参考@图片3。':'保持@图片1的原视角，将窗帘替换为白色，窗帘形状参考@图片3。',输出比例:i%2?'16:9':null}};
}
function provider(t,choice='auto'){return profiles.find(p=>p.id===(choice==='auto'?MODEL_BINDINGS[t.data.处理分类]:choice));}
function jobFor(t,choice='auto'){
 const p=provider(t,choice),date=new Date().toISOString();
 return{id:'demo-job-'+(++serial),taskId:t.id,taskNumber:t.data.任务编号,folder:t.folder,folderName:t.folderName,category:t.data.处理分类,providerName:p.name,status:'queued',createdAt:date,updatedAt:date,plan:planTask(t,p),remoteId:'',resultPath:'',resultCount:0,error:'',canResume:false};
}
function reset(){
 serial=0;hasKey=true;paused=true;tasks=Array.from({length:4},(_,i)=>createTask(i));
 const done=jobFor(tasks[0]);Object.assign(done,{status:'completed',remoteId:'demo-remote-001',resultPath:tasks[0].folder+'/AI/T001_01.svg',resultCount:1});
 const failed=jobFor(tasks[3]);Object.assign(failed,{status:'failed',remoteId:'demo-remote-002',canResume:true,error:'演示：结果下载中断，可点击“继续查询 / 下载”体验恢复。'});jobs=[done,failed];
}
reset();
function progress(){
 const now=Date.now();
 for(const j of jobs){
  if(!j.started||!['uploading','submitting','polling','saving'].includes(j.status))continue;
  const time=now-j.started;
  j.status=time<1200?'uploading':time<2400?'submitting':time<6500?'polling':time<7800?'saving':'completed';
  if(time>=2400)j.remoteId||='demo-remote-'+j.id;
  if(j.status==='completed'){j.resultPath=j.folder+'/AI/'+j.taskNumber+'_演示.svg';j.resultCount=1;j.canResume=false;}
  j.updatedAt=new Date().toISOString();
 }
 if(!paused&&!jobs.some(j=>['uploading','submitting','polling','saving'].includes(j.status))){const next=jobs.find(j=>j.status==='queued');if(next){next.started=now;next.status='uploading';}}
}
function snapshot(choice){
 progress();
 return{token:'demo-only',examplePath:root,lastFolderChoice:root,baseUrl:'演示环境',hasKey,credentialNotice:'',concurrency:1,paused,active:jobs.filter(j=>['uploading','submitting','polling','saving'].includes(j.status)).length,providers:profiles,bindings:MODEL_BINDINGS,jobs:[...jobs].reverse().slice(0,300),tasks:tasks.map(t=>{
  const p=provider(t,choice),plan=planTask(t,p),last=jobs.findLast(j=>j.taskId===t.id),errors=[];
  if(!hasKey)errors.push('请保存虚拟演示配置后体验执行');
  if(plan.ratio&&!p.allowedAspectRatios.includes(plan.ratio))errors.push(p.name+' 不支持该比例');
  return{...t,plan,providerName:p.name,providerId:p.id,configErrors:errors,status:last?.status||(errors.length?'unconfigured':'ready'),latestJob:last||null};
 })};
}
function picker(){
 return new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='demo-picker';
  d.innerHTML='<div class="dialog-header"><div><span class="eyebrow">DEMO FOLDERS</span><h2>选择示例需求</h2></div></div><div class="form-body"><p class="subtitle">在线演示使用虚拟目录，真实文件夹请在本地版选择。</p><button class="demo-folder" data-folder="all"><strong>▱ 全部示例需求</strong><span>2 个目录 · 4 条作图任务</span></button>'+names.map((n,i)=>'<button class="demo-folder" data-folder="'+i+'"><strong>▱ '+n+'</strong><span>2 条作图任务</span></button>').join('')+'<button class="button" data-cancel>取消</button></div>';
  const close=value=>{d.close();d.remove();resolve({path:value});};
  d.addEventListener('cancel',e=>{e.preventDefault();close('');});
  d.addEventListener('click',e=>{const folder=e.target.closest('[data-folder]');if(folder)close(folder.dataset.folder==='all'?root:root+'/'+names[Number(folder.dataset.folder)]);else if(e.target.closest('[data-cancel]'))close('');});
  document.body.append(d);d.showModal();
 });
}
export async function request(route,body){
 const url=new URL(route,'https://demo.invalid'),action=url.pathname;
 if(action==='/api/state')return structuredClone(snapshot(url.searchParams.get('modelChoice')||'auto'));
 if(action==='/api/demo-reset'){reset();return{ok:true};}
 if(action==='/api/pick-folder')return picker();
 if(action==='/api/import'){
  const chosen=body.paths||[],ids=new Set(tasks.map(t=>t.id));let added=0,updated=0;const folders=new Set();
  for(let i=0;i<4;i++){const t=createTask(i);if(!chosen.some(p=>p===root||p===t.folder))continue;folders.add(t.folder);if(ids.has(t.id)){updated++;continue;}tasks.push(t);ids.add(t.id);added++;}
  return{folders:folders.size,added,updated,warnings:folders.size?[]:['请选择演示中的示例目录。']};
 }
 if(action==='/api/account'){hasKey=!body.clearKey;return{ok:true};}
 if(action==='/api/start'){
  let added=0;const skipped=[];const choice=body.modelChoice||'auto';
  for(const id of body.ids||[]){const t=tasks.find(t=>t.id===id);if(!t)continue;const last=jobs.findLast(j=>j.taskId===id);
   if(last&&['queued','uploading','submitting','polling','saving'].includes(last.status)){skipped.push(t.data.任务编号+' 已在模拟队列中');continue;}
   if(last?.status==='completed'&&!body.force){skipped.push(t.data.任务编号+' 已完成，请在详情中重新生成');continue;}
   if(last?.canResume&&!body.force){skipped.push(t.data.任务编号+' 请先继续查询 / 下载');continue;}
   if(!hasKey){skipped.push('请保存虚拟配置');continue;}jobs.push(jobFor(t,choice));added++;
  }paused=false;progress();return{added,skipped};
 }
 if(action==='/api/pause'){paused=body.paused!==false;return{ok:true};}
 if(action==='/api/resume-job'){const j=jobs.find(j=>j.id===body.id);if(!j?.canResume)throw Error('没有可恢复的模拟任务');Object.assign(j,{status:'saving',started:Date.now()-6600,error:''});paused=false;return{ok:true};}
 if(action==='/api/override'){
  const t=tasks.find(t=>t.id===body.id);if(!t)throw Error('演示任务不存在');
  if(jobs.some(j=>j.taskId===t.id&&['queued','uploading','submitting','polling','saving'].includes(j.status)))throw Error('请等待模拟执行结束');
  const old=t.override;t.override=body.prompt||undefined;try{planTask(t,provider(t));}catch(e){t.override=old;throw e;}jobs=jobs.filter(j=>j.taskId!==t.id);return{ok:true};
 }
 if(action==='/api/remove'){const count=tasks.length;const blocked=new Set(jobs.filter(j=>['queued','uploading','submitting','polling','saving'].includes(j.status)).map(j=>j.taskId));tasks=tasks.filter(t=>!body.ids?.includes(t.id)||blocked.has(t.id));return{removed:count-tasks.length};}
 if(action==='/api/open-folder')return{demo:true};
 throw Error('此操作请在图派本地版使用');
}
export const thumbnailUrl=t=>t.folderName===names[0]?'/assets/living-original.svg':'/assets/dining-original.svg';
export const viewerUrl=(item,job=false)=>'/demo-viewer.html?scene='+encodeURIComponent((item.folderName===names[0]?'living':'dining')+(job?'-result':'-original'));
