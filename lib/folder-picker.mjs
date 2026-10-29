import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let buildPromise,selecting=false;
export async function buildPicker(){
  if(process.platform!=='win32')throw new Error('此目录选择器适用于 Windows；也可粘贴完整路径导入');
  if(buildPromise)return buildPromise;
  buildPromise=(async()=>{
    const source=path.join(root,'native','FolderPicker.cs'),dir=path.join(root,'.local','native'),binary=path.join(dir,'FolderPicker.exe');
    if(fs.existsSync(binary)&&fs.statSync(binary).mtimeMs>=fs.statSync(source).mtimeMs)return binary;
    const windows=process.env.SystemRoot||'C:\\Windows';
    const compiler=['Framework64','Framework'].map(arch=>path.join(windows,'Microsoft.NET',arch,'v4.0.30319','csc.exe')).find(file=>fs.existsSync(file));
    if(!compiler)throw new Error('未找到 Windows .NET 目录选择组件，请暂时粘贴完整路径导入');
    fs.mkdirSync(dir,{recursive:true});
    try{await exec(compiler,['/nologo','/target:exe','/platform:anycpu','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+binary,source],{windowsHide:true,timeout:30000,encoding:'utf8'});}
    catch{throw new Error('目录选择组件准备失败，请暂时粘贴完整路径导入');}
    return binary;
  })();
  try{return await buildPromise;}catch(e){buildPromise=undefined;throw e;}
}
export async function pickFolder(initial=''){
  if(selecting)throw new Error('目录选择窗口已打开，请先完成或取消选择');
  selecting=true;
  try{
    const binary=await buildPicker();
    const args=typeof initial==='string'&&initial.length<1024&&fs.existsSync(initial)?[initial]:[];
    const {stdout}=await exec(binary,args,{windowsHide:true,timeout:180000,encoding:'utf8',maxBuffer:16384});
    const chosen=stdout.replace(/^\uFEFF/,'').trim();
    if(chosen&&!fs.statSync(chosen).isDirectory())throw new Error('选择的目录不可用');
    return chosen;
  }catch(e){if(/目录|组件/.test(e.message))throw e;throw new Error('目录窗口未完成选择，可重试或粘贴完整路径');}
  finally{selecting=false;}
}
export async function openFolder(folder){
  const binary=await buildPicker();
  try{await exec(binary,['--open-folder',fs.realpathSync(folder)],{windowsHide:true,timeout:15000});}
  catch{throw new Error('Windows 未能打开文件夹，请复制详情中的路径手动打开');}
}
const pending=new Map();let tail=Promise.resolve();
export async function thumbnail(file,dataDir){
  const stat=fs.statSync(file);
  const {createHash}=await import('node:crypto');
  const id=createHash('sha256').update(file+':'+stat.size+':'+stat.mtimeMs).digest('hex');
  const dir=path.join(dataDir,'thumbnails'),target=path.join(dir,id+'.jpg');
  if(fs.existsSync(target))return target;
  if(pending.has(id))return pending.get(id);
  const work=tail.catch(()=>{}).then(async()=>{
    fs.mkdirSync(dir,{recursive:true});const binary=await buildPicker();
    await exec(binary,['--thumbnail',file,target],{windowsHide:true,timeout:20000});return target;
  }).finally(()=>pending.delete(id));
  tail=work;pending.set(id,work);return work;
}
