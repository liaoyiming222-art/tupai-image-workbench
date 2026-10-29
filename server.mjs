import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { contained, discover, readFolder, planTask, imageType } from './lib/core.mjs';
import { providerErrors, submit, poll, outputBytes, UncertainError } from './lib/providers.mjs';
import { secret, secretSync } from './lib/secrets.mjs';
import {defaultProviders,RUNNINGHUB_BASE,CATALOG_VERSION,MODEL_BINDINGS} from './lib/catalog.mjs';
import {pickFolder,openFolder,thumbnail} from './lib/folder-picker.mjs';
export {defaultProviders} from './lib/catalog.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const now=()=>new Date().toISOString();
export function createApp({dataDir=path.join(ROOT,'.local'),pollInterval=5000,keyResolver,folderPicker=pickFolder,folderOpener=openFolder,baseUrl}={}) {
  fs.mkdirSync(dataDir,{recursive:true});
  const stateFile=path.join(dataDir,'state.json');
  let state={version:4,catalogVersion:CATALOG_VERSION,baseUrl:RUNNINGHUB_BASE,keyCipher:'',credentialNotice:'',concurrency:1,paused:true,providers:defaultProviders(),bindings:{...MODEL_BINDINGS},tasks:{},jobs:[]};
  if(fs.existsSync(stateFile))state={...state,...JSON.parse(fs.readFileSync(stateFile,'utf8'))};
  if(state.version<4){
    for(const job of state.jobs)if(!job.credentialCipher)job.credentialCipher=job.provider?.keyCipher||state.providers.find(p=>p.id===job.provider?.id)?.keyCipher||state.keyCipher||'';
    if(!state.keyCipher){
      const ciphers=state.providers.map(p=>p.keyCipher).filter(Boolean);
      try{
        const distinct=new Set(ciphers.map(value=>secretSync(value,true,dataDir)));
        if(distinct.size===1)state.keyCipher=ciphers[0];
        else if(distinct.size>1)state.credentialNotice='旧配置包含不同的 API Key，请重新保存一份共享 Key。历史任务仍使用原凭据查询。';
      }catch{state.credentialNotice='旧 API Key 无法读取，请重新保存一份共享 Key。';}
    }
  }
  // Only the two documented models are selectable; credentials belong to the account.
  state.providers=defaultProviders();state.bindings={...MODEL_BINDINGS};state.baseUrl=baseUrl||RUNNINGHUB_BASE;
  state.catalogVersion=CATALOG_VERSION;state.version=4;
  state.paused=true;
  for(const job of state.jobs)if(['uploading','submitting','polling','saving','running'].includes(job.status)){
    job.status=job.remoteId||job.output?'queued':'uncertain';job.error=job.status==='uncertain'?'程序曾中断，请核对 RunningHub 记录后决定是否重新生成。':'';
  }
  const token=crypto.randomBytes(24).toString('hex'),active=new Set();let closed=false;
  function save(){const temp=stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(temp,stateFile);}
  save();
  function modelChoice(value='auto'){if(!['auto','gemini','gpt'].includes(value))throw new Error('请选择有效的生图模型');return value;}
  const providerFor=(task,choice='auto')=>state.providers.find(p=>p.id===(choice==='auto'?state.bindings[task.data.处理分类]:choice));
  const latest=id=>state.jobs.findLast(j=>j.taskId===id);
  const getKey=async job=>keyResolver?keyResolver(job.provider):secret(job.credentialCipher||job.provider?.keyCipher,true,dataDir);
  const publicProvider=({keyCipher,apiKey,clearKey,...provider})=>provider;
  function viewTask(task,choice='auto'){
    let plan=null;const errors=[...task.errors],provider=providerFor(task,choice);
    try{plan=planTask(task,provider);}catch(e){errors.push(e.message);}
    const configErrors=providerErrors(provider,plan);
    if(!state.keyCipher&&!keyResolver)configErrors.push('请先保存共享 RunningHub API Key');
    const job=latest(task.id);
    let status=errors.length?'invalid':configErrors.length?'unconfigured':'ready';
    if(job&&job.fingerprint===task.fingerprint&&job.override===(task.override||'')){
      status=job.status;
      if(status==='completed'&&!fs.existsSync(job.resultPath||''))status='missing';
    }
    return{...task,assets:undefined,plan:plan?{...plan,mapping:plan.mapping.map(({file,...row})=>row)}:null,providerName:provider?.name,providerId:provider?.id,configErrors,errors:[...new Set(errors)],status,latestJob:job?publicJob(job):null};
  }
  function publicJob(job){return{id:job.id,taskId:job.taskId,taskNumber:job.taskNumber,folder:job.folder,folderName:path.basename(job.folder),category:job.category,status:job.status,error:job.error||'',createdAt:job.createdAt,updatedAt:job.updatedAt,providerName:job.provider.name,remoteId:job.remoteId||'',resultPath:job.resultPath||'',plan:{...job.plan,mapping:job.plan.mapping.map(({file,...row})=>row)},resultCount:job.resultCount||0,inputHashes:job.inputHashes||[],canResume:!!(job.remoteId||job.output)&&!job.remoteTerminal};}
  function snapshot(choice='auto'){modelChoice(choice);return{appName:'local-image-workbench',token,examplePath:path.join(ROOT,'示例需求'),lastFolderChoice:state.lastFolderChoice||'',baseUrl:state.baseUrl,hasKey:!!state.keyCipher||!!keyResolver,credentialNotice:state.credentialNotice||'',concurrency:state.concurrency,paused:state.paused,active:active.size,providers:state.providers.map(publicProvider),bindings:state.bindings,tasks:Object.values(state.tasks).map(task=>viewTask(task,choice)),jobs:state.jobs.slice(-300).reverse().map(publicJob)};}
  function update(job,patch){Object.assign(job,patch,{updatedAt:now()});save();}
  function refreshTask(task){
    const fresh=readFolder(task.folder).find(row=>row.id===task.id);
    if(!fresh||fresh.fingerprint!==task.fingerprint)throw new Error('原需求文档已改变，请重新导入后运行');
    if(fresh.errors.length)throw new Error(fresh.errors.join('；'));
    return{...fresh,override:task.override};
  }
  function checkOutputFolder(folder){
    const real=fs.realpathSync(folder),out=path.join(real,'AI');
    fs.mkdirSync(out,{recursive:true});
    if(!contained(real,fs.realpathSync(out)))throw new Error('AI 目录不能指向需求文件夹外部');
    fs.accessSync(out,fs.constants.W_OK);return out;
  }
  async function execute(job){
    try{
      const key=await getKey(job);if(!key)throw new Error('请保存共享 RunningHub API Key 后重新执行');
      if(!job.remoteId&&!job.output){
        const task=state.tasks[job.taskId];if(!task)throw new Error('原任务已移除');
        refreshTask(task);checkOutputFolder(job.folder);
        update(job,{status:'uploading',error:''});
        const result=await submit(job.baseUrl,job.provider,job.plan,key,job.folder,hashes=>update(job,{status:'submitting',inputHashes:hashes}));
        update(job,{remoteId:result.remoteId,status:'polling',pollStarted:Date.now()});
      }
      let failures=0;
      while(!job.output&&!closed){
        update(job,{status:'polling'});
        let result;
        try{result=await poll(job.baseUrl,job.provider,job.remoteId,key);failures=0;}
        catch(e){if(/任务失败|指定输出|错误码/.test(e.message)||++failures>=3)throw e;await new Promise(r=>setTimeout(r,pollInterval));continue;}
        if(result.done){update(job,{output:result.output,resultCount:result.resultCount,status:'saving'});break;}
        if(Date.now()-(job.pollStarted||Date.now())>24*60*60*1000)throw new Error('查询超过 24 小时，可稍后继续查询原任务');
        await new Promise(r=>setTimeout(r,pollInterval));
      }
      if(closed)return;
      update(job,{status:'saving'});
      const image=await outputBytes(job.output),out=checkOutputFolder(job.folder);
      const temp=path.join(out,`.${job.id}.tmp`);
      if(fs.existsSync(temp)){
        if(fs.lstatSync(temp).isSymbolicLink()||!fs.lstatSync(temp).isFile())throw new Error('临时输出位置异常');
        fs.unlinkSync(temp);
      }
      let target;
      try{
        fs.writeFileSync(temp,image.bytes,{flag:'wx'});
        for(let version=1;version<100000;version++){
          target=path.join(out,`${job.taskNumber}_${String(version).padStart(2,'0')}.${image.ext}`);
          try{fs.linkSync(temp,target);break;}catch(e){if(e.code!=='EEXIST')throw e;target=null;}
        }
        if(!target)throw new Error('结果版本过多');
      }finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
      update(job,{status:'completed',resultPath:target,error:''});
    }catch(e){update(job,{status:e instanceof UncertainError?'uncertain':'failed',error:e.message,remoteTerminal:/RunningHub 任务失败/.test(e.message)});}
  }
  function tick(){
    if(closed||state.paused)return;
    for(const job of state.jobs){
      if(active.size>=state.concurrency)break;
      if(job.status!=='queued'||active.has(job.id)||[...active].some(id=>state.jobs.find(j=>j.id===id)?.taskId===job.taskId))continue;
      active.add(job.id);execute(job).finally(()=>{active.delete(job.id);tick();});
    }
  }
  const timer=setInterval(tick,500);timer.unref();
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  async function readBody(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2*1024*1024)throw new Error('请求过大');}return text?JSON.parse(text):{};}
  const server=http.createServer(async(req,res)=>{
    try{
      const address=server.address(),authority=`127.0.0.1:${address.port}`;
      if(![authority,`localhost:${address.port}`].includes(req.headers.host)){send(res,403,{error:'仅允许本机访问'});return;}
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
      const url=new URL(req.url,`http://${authority}`),route=url.pathname;
      if(req.method==='GET'&&route==='/api/state'){send(res,200,snapshot(url.searchParams.get('modelChoice')||'auto'));return;}
      if(req.method==='GET'&&route==='/viewer'){
        const job=state.jobs.find(j=>j.id===url.searchParams.get('job')),task=state.tasks[url.searchParams.get('task')],image=url.searchParams.get('image');
        if(!job?.resultPath&&!task?.assets?.[image])throw new Error('图片不存在');
        const src=job?.resultPath?`/api/result?job=${encodeURIComponent(job.id)}`:`/api/image?task=${encodeURIComponent(task.id)}&amp;image=${encodeURIComponent(image)}`;
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图派 · 图片预览</title><link rel="stylesheet" href="/viewer.css"><body><img alt="图片预览" src="${src}"></body></html>`);return;
      }
      if(req.method==='GET'&&(route==='/api/image'||route==='/api/thumbnail')){
        const task=state.tasks[url.searchParams.get('task')],asset=url.searchParams.get('image'),file=task?.assets[asset];
        if(!file||!contained(fs.realpathSync(task.folder),fs.realpathSync(file)))throw new Error('图片不可访问');
        if(route==='/api/thumbnail'){
          try{const small=await thumbnail(file,dataDir);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private,max-age=3600'});res.end(fs.readFileSync(small));}
          catch{res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private,max-age=60'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#edf3e8"/><text x="36" y="42" text-anchor="middle" font-size="12" fill="#657762">图片</text></svg>');}return;
        }
        const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':imageType(bytes).mime,'Cache-Control':'no-store'});res.end(bytes);return;
      }
      if(req.method==='GET'&&route==='/api/result'){
        const job=state.jobs.find(j=>j.id===url.searchParams.get('job'));
        if(!job?.resultPath||!contained(fs.realpathSync(path.join(job.folder,'AI')),fs.realpathSync(job.resultPath)))throw new Error('结果不可访问');
        const bytes=fs.readFileSync(job.resultPath);res.writeHead(200,{'Content-Type':imageType(bytes).mime,'Cache-Control':'no-store'});res.end(bytes);return;
      }
      if(req.method==='GET'&&!route.startsWith('/api/')){
        const allowed={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/finishing.css':'finishing.css','/viewer.css':'viewer.css','/icon.svg':'icon.svg'},file=allowed[route];
        if(!file){send(res,404,{error:'页面不存在'});return;}
        res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(ROOT,'public',file)));return;
      }
      if(req.method!=='POST'){send(res,405,{error:'不支持的方法'});return;}
      if(req.headers['x-local-token']!==token || (req.headers.origin&&!['http://'+authority,`http://localhost:${address.port}`].includes(req.headers.origin))){send(res,403,{error:'请从本机工具页面操作'});return;}
      const body=await readBody(req);
      if(route==='/api/import'){
        const report={folders:0,added:0,updated:0,warnings:[]};
        const paths=Array.isArray(body.paths)?body.paths:[];if(!paths.length)throw new Error('请输入文件夹的完整路径');
        for(const input of paths){
          try{
            const discovered=discover(input,body.recursive!==false);report.warnings.push(...discovered.warnings);
            if(!discovered.folders.length)report.warnings.push(`${input}：未找到作图需求.json`);
            for(const folder of discovered.folders){
              try{
                const tasks=readFolder(folder);report.folders++;
                for(const task of tasks){
                  const old=state.tasks[task.id];
                  if(old&&state.jobs.some(j=>j.taskId===task.id&&['queued','uploading','submitting','polling','saving'].includes(j.status))){report.warnings.push(`${task.data.任务编号} 正在执行，未更新`);continue;}
                  if(old){task.override=old.fingerprint===task.fingerprint?old.override:undefined;report.updated++;}else report.added++;
                  state.tasks[task.id]=task;
                }
                const newIds=new Set(tasks.map(t=>t.id));
                for(const old of Object.values(state.tasks))if(old.folder===folder&&!newIds.has(old.id)&&!state.jobs.some(j=>j.taskId===old.id&&['queued','uploading','submitting','polling','saving'].includes(j.status)))delete state.tasks[old.id];
              }catch(e){report.warnings.push(`${folder}：${e.message}`);}
            }
          }catch(e){report.warnings.push(`${input}：${e.message}`);}
        }
        save();send(res,200,report);return;
      }
      if(route==='/api/settings'){
        state.concurrency=Math.min(8,Math.max(1,Number(body.concurrency)||1));save();send(res,200,{ok:true});return;
      }
      if(route==='/api/account'){
        if(body.apiKey!==undefined&&typeof body.apiKey!=='string')throw new Error('API Key 必须为文字');
        const apiKey=body.apiKey?.trim();
        if(apiKey&&(/[\r\n]/.test(apiKey)||apiKey.length>2048))throw new Error('请填写有效的单行 API Key');
        if(body.clearKey)state.keyCipher='';else if(apiKey)state.keyCipher=await secret(apiKey,false,dataDir);
        if(body.clearKey||apiKey)state.credentialNotice='';
        save();send(res,200,{ok:true});return;
      }
      if(route==='/api/start'){
        const choice=modelChoice(body.modelChoice);
        const ids=Array.isArray(body.ids)?[...new Set(body.ids)]:[];let added=0;const skipped=[];
        for(const id of ids){
          const task=state.tasks[id];if(!task)continue;
          try{
            if(state.jobs.some(j=>j.taskId===id&&['queued','uploading','submitting','polling','saving'].includes(j.status)))throw new Error('任务已在队列中');
            const view=viewTask(task,choice);if(view.errors.length||view.configErrors.length)throw new Error([...view.errors,...view.configErrors].join('；'));
            const previous=latest(id);
            if(previous?.status==='failed'&&(previous.remoteId||previous.output)&&!previous.remoteTerminal&&!body.force)throw new Error('原任务可以恢复，请先继续查询 / 下载，或明确选择重新生成');
            if(previous&&previous.fingerprint===task.fingerprint&&previous.override===(task.override||'')&&['completed','uncertain'].includes(previous.status)&&!body.force)throw new Error('已完成或提交结果不确定，请在详情中明确选择重新生成');
            refreshTask(task);checkOutputFolder(task.folder);
            const provider=providerFor(task,choice),plan=planTask(task,provider);
            state.jobs.push({id:crypto.randomUUID(),taskId:id,taskNumber:task.data.任务编号,category:task.data.处理分类,folder:task.folder,fingerprint:task.fingerprint,override:task.override||'',provider:structuredClone(provider),credentialCipher:state.keyCipher,baseUrl:state.baseUrl,plan,status:'queued',createdAt:now(),updatedAt:now()});added++;
          }catch(e){skipped.push(`${task.data.任务编号}：${e.message}`);}
        }
        state.paused=false;save();tick();send(res,200,{added,skipped});return;
      }
      if(route==='/api/pause'){state.paused=body.paused!==false;save();tick();send(res,200,{ok:true});return;}
      if(route==='/api/resume-job'){
        const job=state.jobs.find(j=>j.id===body.id);
        if(!job||job.remoteTerminal||!['failed','uncertain'].includes(job.status)||(!job.remoteId&&!job.output))throw new Error('此记录没有可恢复的远程任务');
        update(job,{status:'queued',error:''});state.paused=false;save();tick();send(res,200,{ok:true});return;
      }
      if(route==='/api/override'){
        const task=state.tasks[body.id];if(!task)throw new Error('任务不存在');
        if(state.jobs.some(j=>j.taskId===body.id&&['queued','uploading','submitting','polling','saving'].includes(j.status)))throw new Error('请等待本任务结束再编辑');
        const old=task.override;task.override=body.prompt||undefined;
        try{planTask(task,providerFor(task));}catch(e){task.override=old;throw e;}
        save();send(res,200,{ok:true});return;
      }
      if(route==='/api/remove'){
        let removed=0;
        for(const id of body.ids||[]){
          if(state.jobs.some(j=>j.taskId===id&&['queued','uploading','submitting','polling','saving'].includes(j.status)))continue;
          if(state.tasks[id]){delete state.tasks[id];removed++;}
        }
        save();send(res,200,{removed});return;
      }
      if(route==='/api/shutdown'){
        if(active.size)throw new Error('仍有任务正在处理，请先暂停新提交并等待当前任务结束');
        state.paused=true;save();send(res,200,{ok:true});setTimeout(()=>closeApp(),100);return;
      }
      if(route==='/api/pick-folder'){
        const chosen=await folderPicker(body.initial||state.lastFolderChoice||'');
        if(chosen){state.lastFolderChoice=chosen;save();}send(res,200,{path:chosen});return;
      }
      if(route==='/api/open-folder'){
        const task=state.tasks[body.id];if(!task)throw new Error('任务不存在');
        const folder=body.output?checkOutputFolder(task.folder):task.folder;
        await folderOpener(folder);send(res,200,{ok:true});return;
      }
      send(res,404,{error:'接口不存在'});
    }catch(e){send(res,400,{error:e.message});}
  });
  async function closeApp(){closed=true;clearInterval(timer);state.paused=true;save();await new Promise(r=>server.close(r));}
  return{server,state:()=>state,snapshot,close:closeApp};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp();const port=Number(process.env.PORT)||5137;
  app.server.listen(port,'127.0.0.1',()=>console.log(`本地作图工作台已启动：http://127.0.0.1:${port}`));
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已使用，请打开已有工作台，或设置 PORT 后重启。':e.message);process.exit(1);});
  process.on('SIGINT',async()=>{await app.close();process.exit(0);});
}
