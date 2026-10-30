import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildLauncher} from '../scripts/build-launcher.mjs';
test('Windows 启动器可编译并运行自检，启动入口不调用 PowerShell',{skip:process.platform!=='win32'},async()=>{
 const exe=await buildLauncher();assert.ok(fs.statSync(exe).size>10000);
 const {stdout}=await promisify(execFile)(exe,['--self-test'],{windowsHide:true,timeout:10000});assert.equal(stdout,'TUPAI_LAUNCHER_READY');
 for(const file of ['启动工作台.cmd','停止工作台.cmd'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/powershell/i);
});
