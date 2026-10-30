import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildLauncher(){
 if(process.platform!=='win32')throw Error('启动器仅适用于 Windows');
 const windows=process.env.SystemRoot||'C:\\Windows',csc=['Framework64','Framework'].map(a=>path.join(windows,'Microsoft.NET',a,'v4.0.30319','csc.exe')).find(fs.existsSync);
 if(!csc)throw Error('未找到 Windows .NET Framework 编译器');
 const out=path.join(root,'图派启动器.exe'),icon=path.join(root,'.local','launcher.ico');fs.mkdirSync(path.dirname(icon),{recursive:true});
 const args=['/nologo','/codepage:65001','/target:winexe','/platform:anycpu','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+out,path.join(root,'native','Launcher.cs')];
 await exec(csc,args,{windowsHide:true,timeout:30000});await exec(out,['--make-icon',icon],{windowsHide:true,timeout:10000});await exec(csc,[...args,'/win32icon:'+icon],{windowsHide:true,timeout:30000});
 return out;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildLauncher());
