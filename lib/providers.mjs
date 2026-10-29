import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { imageType, fillTemplate, contained } from './core.mjs';
export class UncertainError extends Error {}
export function endpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入不含用户名密码的 HTTP(S) 地址');
  return url;
}
export async function requestJson(url, options = {}, timeout = 600000, submission = false) {
  endpoint(url); let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout), redirect: 'error' }); }
  catch { if (submission) throw new UncertainError('提交连接中断或超时，是否已接收未知。请先核对 RunningHub 任务记录，再决定是否重新生成。'); throw new Error('RunningHub 连接失败或请求超时'); }
  if (submission && response.status >= 500) throw new UncertainError(`RunningHub 返回 HTTP ${response.status}，提交结果不确定，请核对任务记录`);
  if (!response.ok) throw new Error(`RunningHub 返回 HTTP ${response.status}，请检查密钥权限、站点及接口配置`);
  try { return await response.json(); } catch { if (submission) throw new UncertainError('提交后收到非 JSON 响应，请核对 RunningHub 任务记录'); throw new Error('接口没有返回有效 JSON'); }
}
export function providerErrors(provider, plan) {
  const errors=[];
  if (!provider) return ['尚未绑定 RunningHub 能力'];
  if (!provider.submitPath?.startsWith('/')) errors.push('接口路径必须以 / 开头');
  if (!['model','aiapp','workflow'].includes(provider.type)) errors.push('请选择 RunningHub 接口类型');
  if (plan && plan.mapping.length > (provider.maxImages || 10)) errors.push('图片数量超过该能力配置的上限');
  if (plan && (!plan.prompt?.trim() || plan.prompt.length > (provider.maxPromptLength||20000))) errors.push('发送提示词须为 1–20000 个字符');
  if (plan?.ratio && provider.allowedAspectRatios && !provider.allowedAspectRatios.includes(plan.ratio)) errors.push(`${provider.name} 不支持输出比例 ${plan.ratio}，请选择其他模型或修正需求`);
  if (plan && provider.maxImageBytes) for (const row of plan.mapping) {
    try { if(row.file && fs.statSync(row.file).size>provider.maxImageBytes) errors.push(`${row.global} 超过 ${provider.name} 单图 ${provider.maxImageBytes/1024/1024}MB 上限`); }
    catch { errors.push(`${row.global} 素材不可读取，请重新导入`); }
  }
  if (provider.type !== 'model') {
    if (!/^\d+$/.test(provider.appId || '')) errors.push('请填写应用或工作流 ID');
    if (!Array.isArray(provider.nodes)) errors.push('节点参数必须为 JSON 数组');
    else if (plan) {
      const text=JSON.stringify(provider.nodes);
      if (!text.includes('{{prompt}}')) errors.push('节点参数需要包含 {{prompt}}');
      for (let i=1;i<=plan.mapping.length;i++) if (!text.includes(`{{image${i}}}`)) errors.push(`节点参数缺少 {{image${i}}}`);
      for (const m of text.matchAll(/\{\{image(\d+)\}\}/g)) if (+m[1]>plan.mapping.length) errors.push(`节点配置需要 ${m[1]} 张图，本任务仅有 ${plan.mapping.length} 张`);
      if (plan.ratio && !text.includes('{{ratio}}')) errors.push('此任务有比例要求，节点参数需要包含 {{ratio}}');
    }
  }
  return [...new Set(errors)];
}
export function loadInputs(plan, maxImages=10, folder, maxImageBytes=50*1024*1024) {
  if(plan.mapping.length>maxImages) throw new Error(`接口最多允许 ${maxImages} 张输入图片`);
  for(const row of plan.mapping) if(fs.statSync(row.file).size>maxImageBytes) throw new Error(`素材过大：单图上限 ${maxImageBytes/1024/1024}MB`);
  return plan.mapping.map(row=>{
    if(folder && !contained(fs.realpathSync(folder),fs.realpathSync(row.file))) throw new Error('素材位置已改变，请重新导入');
    const stat=fs.statSync(row.file);
    if(stat.size>maxImageBytes) throw new Error(`素材过大：单图上限 ${maxImageBytes/1024/1024}MB`);
    const bytes=fs.readFileSync(row.file), type=imageType(bytes);
    return {...row,bytes,...type,hash:crypto.createHash('sha256').update(bytes).digest('hex')};
  });
}
const headers=key=>({Authorization:`Bearer ${key}`,'Content-Type':'application/json'});
const join=(base,suffix)=>{endpoint(base);if(!suffix.startsWith('/')||suffix.startsWith('//'))throw new Error('接口路径必须是本站相对路径');return base.replace(/\/$/,'')+suffix;};
export async function uploadImages(base,apiKey,inputs) {
  const uploaded=[];
  for(const input of inputs){
    const form=new FormData();form.append('file',new Blob([input.bytes],{type:input.mime}),path.basename(input.file));
    const result=await requestJson(join(base,'/openapi/v2/media/upload/binary'),{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form},180000);
    if(result.code!==undefined&&![0,200].includes(Number(result.code)))throw new Error(`素材上传失败，RunningHub 错误码 ${result.code}`);
    const row=result.data||{};
    if(!row.download_url&&!row.fileName&&!row.filename)throw new Error('上传响应缺少素材地址，请检查 API Key 的上传权限');
    uploaded.push({url:row.download_url,fileName:row.fileName||row.filename});
  }
  return uploaded;
}
export async function submit(base,provider,plan,apiKey,folder,beforeSubmit=()=>{}) {
  const errors=providerErrors(provider,plan);if(errors.length)throw new Error(errors.join('；'));
  const inputs=loadInputs(plan,provider.maxImages||10,folder,provider.maxImageBytes),uploaded=await uploadImages(base,apiKey,inputs);
  const params={...(provider.params||{})};
  for(const field of ['aspectRatio','aspect_ratio','ratio'])delete params[field];
  let payload;
  if(provider.type==='model'){
    if(uploaded.some(im=>!im.url))throw new Error('标准模型需要上传接口返回 download_url');
    payload={...params,prompt:plan.prompt,imageUrls:uploaded.map(im=>im.url)};
    if(plan.ratio)payload.aspectRatio=plan.ratio;
    for(const field of ['n','num_images','batch_size','numberOfImages'])if(field in payload)payload[field]=1;
  }else{
    if(uploaded.some(im=>!im.fileName))throw new Error('应用/工作流需要上传接口返回 fileName');
    const vars={prompt:plan.prompt,ratio:plan.ratio,...Object.fromEntries(uploaded.map((im,i)=>[`image${i+1}`,im.fileName]))};
    const nodes=fillTemplate(provider.nodes,vars).filter(node=>node.fieldValue!==null).filter(node=>plan.ratio!==null||!['aspectRatio','aspect_ratio','ratio'].includes(node.fieldName));
    payload={...params,apiKey,nodeInfoList:nodes,...(provider.type==='aiapp'?{webappId:provider.appId}:{workflowId:provider.appId})};
  }
  beforeSubmit(inputs.map(im=>({global:im.global,local:im.local,hash:im.hash})));
  const response=await requestJson(join(base,provider.submitPath),{method:'POST',headers:headers(apiKey),body:JSON.stringify(payload)},provider.timeoutMs||180000,true);
  const remoteId=response.taskId??response.data?.taskId;
  if(remoteId)return{remoteId:String(remoteId)};
  if(response.code!==undefined&&![0,200].includes(Number(response.code)))throw new Error(`RunningHub 拒绝提交，错误码 ${response.code}。请检查余额、并发及能力权限。`);
  throw new UncertainError('提交响应没有 taskId，请先核对 RunningHub 任务记录，避免重复提交');
}
export async function poll(base,provider,remoteId,apiKey) {
  const response=await requestJson(join(base,provider.queryPath||'/openapi/v2/query'),{method:'POST',headers:headers(apiKey),body:JSON.stringify({taskId:remoteId,...(provider.legacyQuery?{apiKey}:{})})},60000);
  if([804,813].includes(Number(response.code)))return{done:false};
  if(response.code!==undefined&&![0,200].includes(Number(response.code)))throw new Error(`RunningHub 查询返回错误码 ${response.code}`);
  const status=String(response.status??response.data?.taskStatus??'').toUpperCase();
  if(['FAILED','FAILURE','ERROR','CANCELED','CANCELLED'].includes(status))throw new Error(`RunningHub 任务失败${response.errorCode?`（${response.errorCode}）`:''}，可在平台查看失败详情`);
  const rows=response.results||(Array.isArray(response.data)?response.data:null);
  if(status==='SUCCESS'||(Array.isArray(rows)&&rows.length)){
    const images=(rows||[]).filter(row=>row.url||row.fileUrl).filter(row=>!row.outputType||/^(png|jpg|jpeg|webp|image)$/i.test(row.outputType));
    const index=provider.outputIndex||0;
    if(!images[index])throw new Error('RunningHub 已完成，但指定输出位置没有图片，请检查输出索引');
    return{done:true,output:{kind:'url',value:images[index].url||images[index].fileUrl},resultCount:images.length};
  }
  return{done:false};
}
export async function outputBytes(output) {
  endpoint(output.value);
  const response=await fetch(output.value,{signal:AbortSignal.timeout(120000),redirect:'follow'});
  if(!response.ok)throw new Error(`结果图片下载失败（HTTP ${response.status}），可重试下载`);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>100*1024*1024)throw new Error('生成图片超过 100MB');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),type=imageType(bytes);
  if(type.ext==='png'&&bytes.subarray(-8,-4).toString()!=='IEND')throw new Error('下载的 PNG 不完整，请重试下载');
  if(type.ext==='jpg'&&(bytes.at(-2)!==255||bytes.at(-1)!==217))throw new Error('下载的 JPEG 不完整，请重试下载');
  return{bytes,...type};
}
