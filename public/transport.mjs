export const isDemo=false;
export async function request(route,body,token){
  const response=await fetch(route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token||''},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');return data;
}
export const thumbnailUrl=t=>`/api/thumbnail?task=${encodeURIComponent(t.id)}&image=${encodeURIComponent(t.data.要处理的图片)}&v=${encodeURIComponent(t.fingerprint)}`;
export const viewerUrl=(t,job=false)=>job?`/viewer?job=${encodeURIComponent(t.id)}`:`/viewer?task=${encodeURIComponent(t.id)}&image=${encodeURIComponent(t.data.要处理的图片)}`;
