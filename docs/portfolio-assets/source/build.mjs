import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(dir,'../..');
// Optional existing dependency directory; no machine-specific paths in sources.
const require=createRequire(process.env.PORTFOLIO_NODE_MODULES?path.join(path.resolve(process.env.PORTFOLIO_NODE_MODULES),'package.json'):path.join(dir,'package.json'));
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
const sharp=require('sharp');
const fontFile=process.env.PORTFOLIO_FONT||(process.env.WINDIR?path.join(process.env.WINDIR,'Fonts','msyh.ttc'):'');
const boldFile=process.env.PORTFOLIO_FONT_BOLD||(process.env.WINDIR?path.join(process.env.WINDIR,'Fonts','msyhbd.ttc'):'');
if(!GlobalFonts.registerFromPath(fontFile,'Portfolio'))throw Error('Set PORTFOLIO_FONT to a CJK font file');
if(!GlobalFonts.registerFromPath(boldFile,'Portfolio Bold'))throw Error('Set PORTFOLIO_FONT_BOLD to a CJK bold font file');
const capture=JSON.parse(await fs.readFile(path.join(dir,'source/capture.json'),'utf8'));
const P={paper:'#f5f6f2',ink:'#183c31',green:'#32634e',muted:'#617469',line:'#dbe3d8',cream:'#f2e6bd',pale:'#e7eee3'};
const icon=await loadImage(await sharp(await fs.readFile(path.join(dir,'icon.svg'))).resize(512,512).png().toBuffer());
const batch=await loadImage(await fs.readFile(path.join(dir,'source/batch.jpg')));
const mapping=await loadImage(await fs.readFile(path.join(dir,'source/mapping.jpg')));
const specs=[];
function canvas(w,h,dark=false){const c=createCanvas(w,h),g=c.getContext('2d');g.fillStyle=dark?P.ink:P.paper;g.fillRect(0,0,w,h);return{c,g};}
function text(g,s,x,y,size=28,color=P.ink,bold=false){g.fillStyle=color;g.font=`${size}px "${bold?'Portfolio Bold':'Portfolio'}"`;g.textBaseline='top';g.fillText(s,x,y);}
function rr(g,x,y,w,h,r,fill){g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=fill;g.fill();}
function brand(g,x,y,size=64,dark=false){g.drawImage(icon,x,y,size,size);text(g,'图派',x+size+20,y+2,size*.67,dark?P.cream:P.ink,true);text(g,'LOCAL IMAGE STUDIO',x+size+22,y+size*.76,size*.18,dark?'#bbcfbf':P.muted);}
function pill(g,label,x,y,w,dark=false){rr(g,x,y,w,44,22,dark?'#294f3f':P.pale);text(g,label,x+18,y+10,20,dark?P.cream:P.green);}
function shot(g,img,crop,x,y,w,h,r=20){
 g.save();g.shadowColor='#183c3126';g.shadowBlur=36;g.shadowOffsetY=14;rr(g,x,y,w,h,r,'#ffffff');g.restore();
 g.save();g.beginPath();g.roundRect(x,y,w,h,r);g.clip();g.drawImage(img,crop.x,crop.y,crop.width,crop.height,x,y,w,h);g.restore();
 g.strokeStyle=P.line;g.lineWidth=1;g.beginPath();g.roundRect(x,y,w,h,r);g.stroke();
}
function footer(g,h,dark=false,mobile=false){const color=dark?'#b7cbbd':P.muted;text(g,mobile?'示例界面 · 虚构数据 / 预设示意图':'实际运行的在线演示界面 · 虚构数据与预设示意图 · 未调用真实生图服务',mobile?48:80,h-56,mobile?30:22,color);}
async function output(c,name,alt,purpose,sources,composition){const buffer=await sharp(c.toBuffer('image/png')).webp({quality:94,effort:6}).toBuffer();await fs.writeFile(path.join(dir,name),buffer);specs.push({path:name,alt,purpose,sources,composition});}

if(!process.argv.includes('--verify')){
 await sharp(await fs.readFile(path.join(dir,'icon.svg'))).resize(512,512).png().toFile(path.join(dir,'icon-512.png'));
 {
  const {c,g}=canvas(1920,1200);brand(g,80,52,70);text(g,'WINDOWS / 本地 AI 批量作图工作台',1260,76,25,P.muted);
  text(g,'让批量作图，有条不紊',80,176,88,P.ink,true);
  text(g,'读取需求文件夹，批量执行并回存结果',84,306,32,P.muted);
  pill(g,'多目录导入',1120,302,168);pill(g,'自动对应编号',1304,302,190);pill(g,'队列与版本回存',1510,302,238);
  shot(g,batch,capture.crops.taskPanel,80,416,1760,677,22);footer(g,1200);
  await output(c,'hero.webp','图派本地 AI 批量作图工作台：有序任务清单、模型选择和执行状态，截图为在线演示虚构数据','造物集首页展台',['icon.svg','source/batch.jpg'],'1920×1200 横向展台；上方品牌与用途，下方放大任务列表真实局部');
 }
 {
  const {c,g}=canvas(1200,900);brand(g,54,40,58);text(g,'WINDOWS 本地工具',864,58,21,P.muted);
  text(g,'把零散需求',54,158,62,P.ink,true);text(g,'排成一张清单',54,237,62,P.green,true);
  text(g,'按分类选模型',784,182,25,P.ink,true);text(g,'结果回到原需求目录',784,234,24,P.muted);
  pill(g,'本地 AI 批量作图',54,329,245);
  shot(g,batch,capture.crops.taskPanel,54,408,1092,420,18);footer(g,900,false,true);
  await output(c,'card.webp','图派作品卡片：把零散需求排成一张清单，展示真实任务列表局部和按分类选择模型','造物集作品卡片',['icon.svg','source/batch.jpg'],'1200×900 卡片；双行标题，右侧能力短语，下方紧凑任务局部，独立排版');
 }
 {
  const {c,g}=canvas(900,1200);brand(g,48,46,66);text(g,'Windows 本地工具',510,70,24,P.muted);
  text(g,'把作图需求',48,188,78,P.ink,true);text(g,'交给有序流程',48,286,78,P.green,true);
  text(g,'读取文件夹 · 批量执行 · 结果回存',50,399,28,P.muted);
  text(g,'桌面界面局部',50,479,28,P.muted);
  shot(g,batch,capture.crops.mobileTaskPanel,48,526,804,472,20);
  footer(g,1200,false,true);text(g,'宣传图为窄屏构图，产品面向 Windows 桌面',48,1093,26,P.muted);
  await output(c,'mobile.webp','图派窄屏宣传图：纵向标题与桌面任务清单局部，明确标注 Windows 本地工具和虚构示例数据','造物集手机浏览与窄屏展示；不表示支持手机安装',['icon.svg','source/batch.jpg'],'900×1200 专用纵向构图；独立双行标题，只截取桌面列表左侧800像素，未将桌面整图缩小');
 }
 {
  const {c,g}=canvas(1920,1200,true);brand(g,80,60,70,true);text(g,'关键能力 / 图片编号映射',84,206,27,P.cream);
  text(g,'素材编号不连续',80,280,72,'#f5f6f2',true);text(g,'输入顺序也清楚',80,374,72,'#f5f6f2',true);
  text(g,'主图与参考图按实际发送顺序',84,514,30,'#bbcfbf');text(g,'自动对应到模型输入编号',84,561,30,'#bbcfbf');
  text(g,'文件夹编号    图片1 + 图片3',84,724,29,P.cream,true);text(g,'模型输入       图片1 + 图片2',84,785,29,P.cream,true);
  text(g,'原始 JSON 与素材保持原样',84,900,27,'#bbcfbf');
  shot(g,mapping,{x:0,y:0,width:mapping.width,height:mapping.height},842,114,998,838,20);footer(g,1200,true);
  await output(c,'detail-01.webp','图派图片编号映射详情：文件夹图片3自动对应为模型输入图片2，右侧为真实运行的任务详情与发送提示词预览','造物集详情页关键功能图',['icon.svg','source/mapping.jpg'],'1920×1200 深绿双栏；左侧解释真实示例编号，右侧展示完整任务详情截图，与主图展示不同功能');
 }
 // Export actual display-size checks, including small icons on both surfaces.
 {
  const {c,g}=canvas(1440,1100);text(g,'展示尺寸与图标检查',36,24,28,P.ink,true);
  const hero=await loadImage(await fs.readFile(path.join(dir,'hero.webp'))),card=await loadImage(await fs.readFile(path.join(dir,'card.webp'))),mobile=await loadImage(await fs.readFile(path.join(dir,'mobile.webp')));
  g.drawImage(hero,36,96,960,600);text(g,'首页 960 × 600',36,712,22,P.muted);
  g.drawImage(mobile,1044,96,360,480);text(g,'窄屏 360 × 480',1044,592,22,P.muted);
  g.drawImage(card,36,770,400,300);text(g,'卡片 400 × 300',36,744,22,P.muted);
  rr(g,620,790,360,200,16,P.paper);rr(g,1020,790,360,200,16,P.ink);
  for(const x of [650,1050]){g.drawImage(icon,x,840,32,32);g.drawImage(icon,x+80,836,40,40);text(g,'32px / 40px',x,920,22,x>1000?P.cream:P.muted);}
  await fs.writeFile(path.join(dir,'source/display-check.webp'),await sharp(c.toBuffer('image/png')).webp({quality:94}).toBuffer());
 }
}

const official=[
 {path:'icon.svg',alt:'图派正式图标：深绿底色上叠放的图片与浅金色星芒',purpose:'品牌图标，可用于32px、40px及更大尺寸',sources:['../../public/icon.svg'],composition:'逐字节沿用项目已有正式矢量图标'},
 {path:'icon-512.png',alt:'图派512像素正式图标',purpose:'造物集产品图标',sources:['icon.svg'],composition:'正式SVG图标高质量栅格化，512×512'},
 ...(specs.length?specs:[
  {path:'hero.webp',alt:'图派本地 AI 批量作图工作台：有序任务清单、模型选择和执行状态，截图为在线演示虚构数据',purpose:'造物集首页展台',sources:['icon.svg','source/batch.jpg']},
  {path:'card.webp',alt:'图派作品卡片：把零散需求排成一张清单，展示真实任务列表局部和按分类选择模型',purpose:'造物集作品卡片',sources:['icon.svg','source/batch.jpg']},
  {path:'mobile.webp',alt:'图派窄屏宣传图：纵向标题与桌面任务清单局部，明确标注 Windows 本地工具和虚构示例数据',purpose:'造物集手机浏览与窄屏展示；不表示支持手机安装',sources:['icon.svg','source/batch.jpg']},
  {path:'detail-01.webp',alt:'图派图片编号映射详情：文件夹图片3自动对应为模型输入图片2，右侧为真实运行的任务详情与发送提示词预览',purpose:'造物集详情页关键功能图',sources:['icon.svg','source/mapping.jpg']}
 ])
];
const sourceImages=[...Object.entries(capture.screenshots).map(([name,description])=>({path:'source/'+name,alt:description,purpose:'真实界面原始拍摄素材',sources:['../../'+capture.entry],composition:description})),{path:'source/display-check.webp',alt:'首页960像素、卡片400像素、窄屏360像素与32和40像素图标的浅深背景展示检查',purpose:'视觉验收联系表',sources:['hero.webp','card.webp','mobile.webp','icon.svg'],composition:'按照实际展示尺寸组合，不用于产品界面宣传'}];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function describe(item){const bytes=await fs.readFile(path.join(dir,item.path)),m=await sharp(bytes).metadata();return{...item,width:m.width,height:m.height,format:m.format,bytes:bytes.length,sha256:sha(bytes)};}
const images=await Promise.all([...official,...sourceImages].map(describe));
const uiPaths=['demo/public/index.html','demo/public/app.js','demo/public/style.css','demo/public/finishing.css','demo/public/transport.mjs','demo/public/reporting.mjs','demo/public/icon.svg'];
const uiFiles=await Promise.all(uiPaths.map(async name=>({path:name,sha256:sha((await fs.readFile(path.join(repo,name),'utf8')).replaceAll('\r\n','\n')),normalization:'UTF-8 LF'})));
for(const f of uiFiles){const committed=execFileSync('git',['show',capture.uiCodeCommit+':'+f.path],{cwd:repo,encoding:'utf8'}).replaceAll('\r\n','\n');if(sha(committed)!==f.sha256)throw Error('Capture code commit mismatch: '+f.path);}
if(!Buffer.from(await fs.readFile(path.join(dir,'icon.svg'))).equals(await fs.readFile(path.join(repo,'public/icon.svg'))))throw Error('Official icon differs from product source');
const manifest={schemaVersion:1,productId:capture.productId,name:'图派',repository:capture.repository,branch:'codex/portfolio-assets',uiCodeCommit:capture.uiCodeCommit,createdOn:capture.capturedOn,timezone:capture.timezone,platform:'Windows 10/11 + Node.js >=22',uiCapture:{entry:capture.entry,viewport:capture.viewport,recipe:'source/capture.json',dataKind:'虚构示例数据、模拟执行与预设SVG示意图',paidServicesUsed:false,personalDataUsed:false},capabilities:['读取需求目录及六字段JSON','按分类或手动选择两种内置模型','图片引用编号转换','队列暂停与恢复','失败任务继续查询或下载','结果回存原需求AI目录并增加版本','运行记录筛选及数据看板'],boundaries:['本地版通过RunningHub调用模型，实际生成可能收费；本次未调用','在线演示仅在内存模拟，不读取真实目录，不接收真实Key，不访问生成服务','截图中的已完成、失败、产出和成功率均为示例状态，不代表真实生产效果','场景插画来自项目内程序生成的SVG，非AI生成效果','窄屏图仅用于手机浏览作品集，不表示产品支持手机安装或移动端生图','不修改造物集仓库；通过固定素材提交接入'],icon:{provenance:'沿用 public/icon.svg，无形状或颜色改写',smallSizesChecked:[32,40]},production:{method:'实际浏览器拍摄 + Canvas独立排版 + Sharp编码；未重绘产品UI',font:'Microsoft YaHei（系统字体，不嵌入或分发字体文件）',source:'source/build.mjs',dependencies:'package.json',externalAssets:[],allAssetPathsRelative:true},uiFiles,images};
const expected={'icon.svg':[64,64,'svg'],'icon-512.png':[512,512,'png'],'hero.webp':[1920,1200,'webp'],'card.webp':[1200,900,'webp'],'mobile.webp':[900,1200,'webp'],'detail-01.webp':[1920,1200,'webp']};
for(const item of images){const e=expected[item.path];if(e&&(item.width!==e[0]||item.height!==e[1]||item.format!==e[2]))throw Error('Invalid dimensions/format: '+item.path);}
if(process.argv.includes('--verify')){
 const saved=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 for(const item of images){const old=saved.images.find(i=>i.path===item.path);if(!old||old.sha256!==item.sha256||old.width!==item.width||old.height!==item.height)throw Error('Manifest mismatch: '+item.path);}
 for(const f of uiFiles)if(!saved.uiFiles.some(i=>i.path===f.path&&i.sha256===f.sha256))throw Error('UI source mismatch: '+f.path);
 console.log('Verified '+images.length+' images: dimensions, formats, SHA-256 and UI source hashes');
}else{await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Created portfolio assets and manifest: '+images.length+' images');}
