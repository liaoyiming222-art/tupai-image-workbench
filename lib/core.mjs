import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const CATEGORIES = ['局部重绘-Gemini', '局部重绘-gpt'];
const FIELDS = ['任务编号', '处理分类', '要处理的图片', '参考图编号', '具体要求', '输出比例'];
export const idOf = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
export const contained = (root, file) => { const r = path.relative(root, file); return !r || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
export function imageType(bytes) {
  if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.subarray(12,16).toString() === 'IHDR') return { mime: 'image/png', ext: 'png' };
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length > 12 && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  throw new Error('文件不是受支持的 PNG、JPEG 或 WebP 图片');
}
export function discover(input, recursive = true) {
  const root = fs.realpathSync(input.trim().replace(/^"|"$/g, ''));
  if (!fs.statSync(root).isDirectory()) throw new Error('请选择文件夹');
  const found = [], warnings = []; let visits = 0;
  function walk(dir, depth) {
    if (++visits > 3000) throw new Error('扫描超过 3000 个目录，请选择更具体的目录');
    if (fs.existsSync(path.join(dir, '作图需求.json'))) { found.push(dir); return; }
    if (!recursive || depth >= 12) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.') || ['AI', '原图', 'node_modules'].includes(entry.name)) continue;
      try { walk(path.join(dir, entry.name), depth + 1); } catch (e) { warnings.push(`${entry.name}：${e.message}`); }
    }
  }
  walk(root, 0); return { folders: found, warnings };
}
export function readFolder(folder) {
  const real = fs.realpathSync(folder), file = path.join(real, '作图需求.json');
  if (!contained(real, fs.realpathSync(file))) throw new Error('需求文件不能指向文件夹外部');
  if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('需求文档过大');
  const document = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!document || !Array.isArray(document.作图需求)) throw new Error('JSON 必须包含“作图需求”数组');
  if (document.作图需求.length > 5000) throw new Error('单文件最多支持 5000 条任务');
  const imageDir = path.join(real, '原图');
  if (!fs.existsSync(imageDir) || !contained(real, fs.realpathSync(imageDir))) throw new Error('缺少原图目录，或目录指向文件夹外部');
  const assets = {}, duplicates = new Set();
  for (const entry of fs.readdirSync(imageDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^图片[1-9]\d*\.(jpg|jpeg|png|webp)$/i.test(entry.name)) continue;
    const asset = path.parse(entry.name).name;
    if (assets[asset]) duplicates.add(asset);
    assets[asset] = path.join(imageDir, entry.name);
  }
  const ids = new Map();
  for (const task of document.作图需求) if (task && typeof task === 'object') ids.set(task.任务编号, (ids.get(task.任务编号) || 0) + 1);
  return document.作图需求.map((raw, index) => {
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const errors = [];
    for (const field of FIELDS) if (!(field in data)) errors.push(`缺少字段：${field}`);
    for (const field of Object.keys(data)) if (!FIELDS.includes(field)) errors.push(`未约定的字段：${field}`);
    if (typeof data.任务编号 !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.任务编号)) errors.push('任务编号只能使用字母、数字、短横线及下划线');
    if (ids.get(data.任务编号) > 1) errors.push('任务编号重复');
    if (!CATEGORIES.includes(data.处理分类)) errors.push('处理分类不在约定范围内');
    if (typeof data.具体要求 !== 'string' || !data.具体要求.trim()) errors.push('具体要求不能为空');
    if (data.输出比例 !== null && (typeof data.输出比例 !== 'string' || !/^[1-9]\d*:[1-9]\d*$/.test(data.输出比例))) errors.push('输出比例必须为正整数比例字符串或 null');
    if (!Array.isArray(data.参考图编号) || data.参考图编号.some(a => typeof a !== 'string')) errors.push('参考图编号必须为字符串数组');
    const references = Array.isArray(data.参考图编号) ? data.参考图编号.filter(a => typeof a === 'string') : [];
    const inputs = [...new Set([data.要处理的图片, ...references])];
    const tokens = [...new Set(typeof data.具体要求 === 'string' ? data.具体要求.match(/@图片[0-9]+/g) || [] : [])].map(a => a.slice(1));
    for (const asset of inputs) {
      if (typeof asset !== 'string' || !/^图片[1-9]\d*$/.test(asset)) { errors.push(`图片编号格式不正确：${String(asset)}`); continue; }
      if (!assets[asset]) errors.push(`找不到素材：${asset}`);
      if (duplicates.has(asset)) errors.push(`素材序号重复：${asset}`);
      if (!tokens.includes(asset)) errors.push(`具体要求未引用：@${asset}`);
      if (assets[asset]) {
        try {
          if (!contained(real, fs.realpathSync(assets[asset]))) throw new Error('素材指向外部文件');
          const fd = fs.openSync(assets[asset], 'r'); const header = Buffer.alloc(32);
          try { fs.readSync(fd, header, 0, 32, 0); imageType(header); } finally { fs.closeSync(fd); }
        } catch (e) { errors.push(`${asset}：${e.message}`); }
      }
    }
    for (const token of tokens) if (!inputs.includes(token)) errors.push(`正文引用未列入输入：@${token}`);
    return {
      id: idOf(`${process.platform === 'win32' ? real.toLowerCase() : real}\0${data.任务编号 || index}${ids.get(data.任务编号)>1?`:duplicate:${index}`:''}`),
      folder: real, folderName: path.basename(real), data, assets: Object.fromEntries(inputs.filter(a => assets[a]).map(a => [a, assets[a]])),
      errors: [...new Set(errors)], fingerprint: idOf(JSON.stringify(data)), importedAt: new Date().toISOString()
    };
  });
}
export function planTask(task, provider) {
  if (task.errors.length) throw new Error(task.errors.join('；'));
  const source = task.override || task.data.具体要求;
  const inputs = [...new Set([task.data.要处理的图片, ...task.data.参考图编号])];
  const mapping = inputs.map((global, index) => ({ global, local: `图片${index + 1}`, role: index === 0 ? '主图' : '参考图', file: task.assets[global] }));
  const local = Object.fromEntries(mapping.map(row => [row.global, row.local]));
  const template = provider?.promptTemplate || '{{prompt}}';
  if (!template.includes('{{prompt}}')) throw new Error('提示词模板必须包含 {{prompt}}');
  const combined = template.replaceAll('{{prompt}}', () => source);
  const converted = combined.replace(/@图片[0-9]+/g, token => {
    const value = local[token.slice(1)]; if (!value) throw new Error(`提示词引用不在本次输入中：${token}`); return '@' + value;
  });
  const body = provider?.referenceStyle === 'ordinal' ? converted.replace(/@图片([0-9]+)/g, '第$1张输入图片') : converted;
  const legend = mapping.map((row, i) => `输入图片${i + 1}：${row.role}`).join('；');
  const ratio = task.data.输出比例;
  return { mapping, originalPrompt: task.data.具体要求, effectivePrompt: source, prompt: `${legend}。\n${body}${ratio ? `\n输出图片比例：${ratio}。` : ''}`, ratio };
}
export function getAt(object, expression) {
  if (!expression) return object;
  return expression.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((v, key) => v?.[key], object);
}
export function fillTemplate(value, vars) {
  if (typeof value === 'string') {
    const match = /^\{\{(\w+)\}\}$/.exec(value);
    if (match) { if (!(match[1] in vars)) throw new Error(`未知模板变量：${match[1]}`); return vars[match[1]]; }
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => { if (!(key in vars)) throw new Error(`未知模板变量：${key}`); return String(vars[key] ?? ''); });
  }
  if (Array.isArray(value)) return value.map(v => fillTemplate(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,fillTemplate(v,vars)]));
  return value;
}
