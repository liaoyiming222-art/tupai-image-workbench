import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.PORTFOLIO_NODE_MODULES?path.join(path.resolve(process.env.PORTFOLIO_NODE_MODULES),'package.json'):path.join(dir,'package.json'));
const sharp=require('sharp');const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
GlobalFonts.registerFromPath(process.env.PORTFOLIO_FONT||path.join(process.env.WINDIR,'Fonts','msyh.ttc'),'CJK');
const specs=JSON.parse(await fs.readFile(path.join(dir,'source/layout.json'))),assets=[];
for(const s of specs){
 const c=createCanvas(s.width,s.height),g=c.getContext('2d');g.fillStyle='#f5f6f2';g.fillRect(0,0,s.width,s.height);
 for(const [name,left,top,width,height,x,y,w] of s.panels){const fragment=await sharp(path.join(dir,'source',name+'.png')).extract({left,top,width,height}).png().toBuffer();g.drawImage(await loadImage(fragment),x,y,w,height*w/width);}
 const mobile=s.mobile,font=mobile?44:32;g.font=`${font}px CJK`;g.fillStyle='#365547';
 if(s.file.includes('prompt-mobile')){g.fillText('原要求局部',60,465);g.fillText('发送提示词局部',60,745);}
 if(s.file.includes('queue')){g.fillText(mobile?'同一失败记录 · 独立局部':'同一张运行记录 · 三个独立列局部',60,mobile?78:100);}
 if(s.file.includes('record-mobile')){g.fillText('示例结果路径 · 未验证落盘',60,610);}
 if(s.result){g.fillText('实际演示界面 · 虚构需求 · 模拟完成',60,1035);g.fillText('预设 SVG · 非模型生成效果',60,1090);g.fillText('未验证真实下载与落盘',60,1140);}
 else{g.fillText(mobile?'桌面演示局部 · 虚构需求':'实际演示界面 · 虚构需求',60,mobile?1090:1100);g.fillText('流程与状态为模拟',60,mobile?1150:1150);}
 const target=path.join(dir,s.file);await sharp(c.toBuffer('image/png')).webp({lossless:true}).toFile(target);const data=await fs.readFile(target),meta=await sharp(data).metadata();
 assets.push({path:s.file,width:meta.width,height:meta.height,format:'webp',sha256:crypto.createHash('sha256').update(data).digest('hex'),alt:s.alt,purpose:s.file.includes('mobile')?'手机作品集展示的桌面界面局部':'作品集详情页功能展示',sourceType:'actual-running-demo-screenshot-crops',sources:[...new Set(s.panels.map(p=>'source/'+p[0]+'.png'))],layoutSource:'source/layout.json',limitations:s.result?'预设 SVG，非模型生成效果；未验证真实下载与落盘':'实际演示界面，虚构需求；流程与状态为模拟。桌面工具，不表示手机安装。'});
 await fs.mkdir(path.join(dir,'checks'),{recursive:true});for(const width of s.mobile?[288,358]:[829,1184])await sharp(data).resize({width}).png().toFile(path.join(dir,'checks',s.file.replace('.webp','-'+width+'.png')));
}
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,taskId:'detail-v2-20261104-tupai',productId:'tupai',repository:'https://github.com/liaoyiming222-art/tupai-image-workbench',branch:'codex/detail-v2-20261104',captureCodeSha:'f5a1da33ca78b2e543a782cac5fa931392cec95b',captureWorkspace:'Clean git archive of locked SHA; business sources unchanged; isolated localhost demo; no RunningHub calls',sourceWorkspace:'Original workspace dirty; all user changes preserved and excluded',scenario:'Fallback to built-in 客厅_窗帘调整 / 餐厅_画面扩展, four tasks; primary mapping/result task 客厅_窗帘调整 T002',deviations:['审定基线不提供新增/重命名示例需求入口；按任务包允许回退，整组使用真实预设示例重新实拍','总览筛选两条待执行任务，并选中客厅 T002；保留原始总数摘要，不伪装为全新三任务','运行记录实拍已完成、暂停队列中的排队中与失败；排队属于进行中分类，不冒充已开始生成','基线运行记录不支持行选中；保留失败行及实际可用继续查询下载按钮，手机拆为同一失败记录的独立局部','手机图为桌面截图独立裁切组合，各局部用留白分开；不重画界面或改DOM'],boundaries:['网页仅内存模拟，不读取真实目录，不接收真实Key，不调用生成服务','所有运行状态、文件夹和结果路径为示例','预设SVG非模型生成效果；未验证真实下载、落盘或递增版本','未纳入源目录清晰度等未提交新增功能'],assets},null,2));
console.log('Built '+assets.length+' verified WebP assets');
