import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
export function png(red=126,green=155,blue=132){
  function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;}
  function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);}
  const w=64,h=64,ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  const pixels=Buffer.alloc((w*3+1)*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*(w*3+1)+1+x*3;pixels[i]=red;pixels[i+1]=green;pixels[i+2]=blue;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export function writeFixture(folder,{category='局部重绘-Gemini',ratio=null,id='T001'}={}){
  fs.mkdirSync(path.join(folder,'原图'),{recursive:true});fs.mkdirSync(path.join(folder,'AI'),{recursive:true});
  fs.writeFileSync(path.join(folder,'原图','图片1.png'),png());fs.writeFileSync(path.join(folder,'原图','图片3.png'),png(203,184,145));
  const data={作图需求:[{任务编号:id,处理分类:category,要处理的图片:'图片1',参考图编号:['图片3'],具体要求:'保持@图片1的原视角不变，将窗帘替换为白色，窗帘形状参考@图片3。',输出比例:ratio}]};
  fs.writeFileSync(path.join(folder,'作图需求.json'),JSON.stringify(data,null,2));return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','示例需求');
  writeFixture(path.join(root,'示例A_窗帘修改'));
  writeFixture(path.join(root,'示例B_扩图'),{category:'局部重绘-gpt',ratio:'1:1'});
  const file=path.join(root,'示例B_扩图','作图需求.json');const d=JSON.parse(fs.readFileSync(file));d.作图需求[0].具体要求='扩图至1:1，保持@图片1的原视角，将窗帘替换为白色，形状参考@图片3。';fs.writeFileSync(file,JSON.stringify(d,null,2));
  console.log('已创建两个用于导入验证的示例需求文件夹。');
}
