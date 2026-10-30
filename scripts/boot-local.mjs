import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'.local');
fs.mkdirSync(dir,{recursive:true});const log=fs.openSync(path.join(dir,'service.log'),'a');
const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log]});
child.once('error',e=>{console.error('本地服务无法启动：'+e.message);process.exitCode=1;});
child.once('spawn',()=>{fs.writeFileSync(path.join(dir,'service.pid'),String(child.pid));child.unref();fs.closeSync(log);});
