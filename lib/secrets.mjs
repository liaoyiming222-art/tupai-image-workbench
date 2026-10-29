import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export function secretSync(value,decrypt=false,dataDir=path.resolve('.local')) {
  if(!value)return '';
  fs.mkdirSync(dataDir,{recursive:true});
  const keyPath=path.join(dataDir,'secret.key');
  if(!fs.existsSync(keyPath)){
    if(decrypt)throw new Error('本机密钥文件缺失，请重新保存 API Key');
    try{fs.writeFileSync(keyPath,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  const key=fs.readFileSync(keyPath);if(key.length!==32)throw new Error('本机密钥文件异常，请检查 .local/secret.key');
  if(decrypt){
    try{
      const [version,iv,tag,text]=value.split('.');if(version!=='aes1')throw new Error('version');
      const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));cipher.setAuthTag(Buffer.from(tag,'base64'));
      return Buffer.concat([cipher.update(Buffer.from(text,'base64')),cipher.final()]).toString('utf8');
    }catch{throw new Error('API Key 无法解密，请重新保存共享 Key');}
  }
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['aes1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
export async function secret(...args) { return secretSync(...args); }
