const allowed=new Set(['living-original','living-result','dining-original','dining-result']);
const scene=new URL(location.href).searchParams.get('scene');
if(allowed.has(scene))document.querySelector('img').src='/assets/'+scene+'.svg';
else document.querySelector('p').textContent='演示素材不存在，请返回任务列表。';
