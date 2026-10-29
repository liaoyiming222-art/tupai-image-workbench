const $ = (s, root=document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {ready:'待执行',invalid:'待修正',unconfigured:'待配置',queued:'排队中',uploading:'上传中',submitting:'提交中',polling:'生成中',saving:'保存中',completed:'已完成',failed:'失败',uncertain:'待核对',missing:'结果缺失'};
const live = ['queued','uploading','submitting','polling','saving'];
const categories = ['局部重绘-Gemini','局部重绘-gpt'];
let state, page='tasks', detail, busy=false, toastTimer, pathDraft=null, modelChoice='auto', taskPage=1, showThumbs=true, lastRows='';
const pageSize=50;
const visibleTasks=()=>filteredTasks().slice((taskPage-1)*pageSize,taskPage*pageSize);
const modelLabel=()=>({auto:'按处理分类自动选择',gemini:'Nano Banana 2',gpt:'GPT Image 2.0'}[modelChoice]);
const selected=new Set();
const statusBadge = status => `<span class="status ${esc(status)}">${esc(labels[status] || status)}</span>`;
const button = (text, action, id='', cls='') => `<button class="button small ${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),6000);}
async function api(route, body){
  const response=await fetch(route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':state?.token||''},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');return data;
}
async function refresh(){
  const choice=modelChoice,next=await api('/api/state?modelChoice='+encodeURIComponent(choice));if(choice!==modelChoice)return;
  state=next;$('#connection').textContent='本地服务已连接';$('#nav-count').textContent=state.tasks.length;
  $('#account-status').textContent=state.hasKey?'API Key 已保存':'API Key 待配置';$('#account-status').classList.toggle('configured',state.hasKey);
  if(page==='tasks')updateTasks();else if(page==='history')updateHistory();
}
function heading(eyebrow,title,subtitle,actions=''){return `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="button-group">${actions}</div></div>`;}
function go(next){page=next;document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#page-label').textContent={tasks:'批量任务',settings:'API 设置',history:'运行记录'}[page];if(page==='tasks')renderTasks();else if(page==='settings')renderSettings();else renderHistory();window.scrollTo({top:0,left:0});}
function renderTasks(){
  lastRows='';
  if(pathDraft===null)pathDraft=state.lastFolderChoice||'';
  $('#main').innerHTML=heading('IMAGE WORKSPACE','批量作图','导入需求，选择模型，结果自动回存至各自的 AI 文件夹。',button('↻ 刷新','refresh'))+
    `<div class="stats" id="stats"></div>
    <div class="setup-grid"><section class="panel import-panel"><div class="panel-header"><div class="section-heading"><span class="step-number">01</span><div><div class="panel-title">导入需求</div><div class="panel-caption">支持单个需求目录、上级目录或多条路径。</div></div></div></div>
    <div class="import-body"><div class="path-input"><textarea id="paths" rows="2" aria-label="需求文件夹路径" placeholder="选择文件夹，或粘贴完整路径，每行一条">${esc(pathDraft)}</textarea><div class="import-actions"><label class="scan-option"><input type="checkbox" id="recursive" checked>扫描子文件夹</label><div class="button-group">${button('选择文件夹','pick')}${button('扫描并导入','import','','primary')}</div></div></div></div></section>
    <section class="panel model-panel"><div class="panel-header"><div class="section-heading"><span class="step-number">02</span><div><div class="panel-title">选择生成模型</div><div class="panel-caption">用于接下来提交的任务。</div></div></div></div><div class="form-body"><label class="sr-only" for="model-choice">生成模型</label><select id="model-choice">${[['auto','按处理分类自动选择'],['gemini','Nano Banana 2'],['gpt','GPT Image 2.0']].map(([id,name])=>`<option value="${id}" ${modelChoice===id?'selected':''}>${name}</option>`).join('')}</select><p class="model-hint" id="model-hint"></p><div class="model-account" id="model-account"></div></div></section></div>
    <div id="report"></div><section class="panel task-panel"><div class="task-panel-heading"><div class="section-heading"><span class="step-number">03</span><div class="panel-title">任务列表 <span id="task-count" class="count-pill"></span></div></div><label class="scan-option"><input id="show-thumbnails" type="checkbox" ${showThumbs?'checked':''}>主图缩略图</label></div><div class="toolbar"><div class="filters"><input id="search" placeholder="搜索任务或要求…" aria-label="搜索任务"><select id="category-filter" class="category-filter" aria-label="处理分类"><option value="">全部分类</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select><select id="status-filter" aria-label="执行状态"><option value="">全部状态</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="button-group">${button('移除','remove')}${button('执行选中','run-selected')}${button('执行全部就绪','run-all','','primary')}</div></div>
    <div id="queue-banner"></div><div class="table-wrap"><table><thead><tr><th><input id="select-all" type="checkbox" aria-label="选择本页任务"></th><th>任务 / 所属需求</th><th>输入素材</th><th>分类 / 本次模型</th><th>输出比例</th><th>状态</th><th>操作</th></tr></thead><tbody id="task-rows"></tbody></table></div><div id="empty-state"></div><div class="table-footer"><span id="table-summary"></span><span id="pagination" class="button-group"></span><span id="queue-controls"></span></div></section>`;
  updateTasks();
}
function filteredTasks(){const q=$('#search')?.value.toLowerCase()||'',cat=$('#category-filter')?.value||'',s=$('#status-filter')?.value||'';return state.tasks.filter(t=>(!cat||t.data.处理分类===cat)&&(!s||t.status===s)&&(!q||`${t.folder} ${t.data.任务编号} ${t.data.具体要求}`.toLowerCase().includes(q)));}
function updateTasks(){
  if(!$('#task-rows'))return;
  $('#task-count').textContent=state.tasks.length;
  $('#model-hint').textContent=modelChoice==='auto'?'Gemini 分类 → Nano Banana 2；gpt 分类 → GPT Image 2.0。':`本次新任务统一使用 ${modelLabel()}，原始处理分类保留。`;
  $('#model-account').innerHTML=state.hasKey?'<span class="live-dot"></span>共享 API Key 已保存':`<span>先保存 RunningHub API Key</span><button class="text-button" data-page="settings">去设置 ↗</button>`;
  const tasks=filteredTasks(),done=state.tasks.filter(t=>t.status==='completed').length,folders=new Set(state.tasks.map(t=>t.folder)).size,problems=state.tasks.filter(t=>['invalid','unconfigured','failed','uncertain','missing'].includes(t.status)).length;
  const stats=[['需求文件夹',folders,'可一次导入多个目录','▱'],['作图任务',state.tasks.length,'每条任务生成一张','▦'],['已完成',done,'结果已保存至 AI 文件夹','✓'],['需要处理',problems,'检查素材、配置或失败原因','◷']];
  $('#stats').innerHTML=stats.map(([label,value,note,icon])=>`<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div><div class="stat-icon">${icon}</div></div>`).join('');
  taskPage=Math.min(taskPage,Math.max(1,Math.ceil(tasks.length/pageSize)));
  const rows=visibleTasks().map(t=>{
    const refs=Array.isArray(t.data.参考图编号)?t.data.参考图编号:[],issue=[...t.errors,...t.configErrors,t.latestJob?.error].filter(Boolean).join('；');
    return `<tr><td><input type="checkbox" data-select="${t.id}" ${selected.has(t.id)?'checked':''} aria-label="选择 ${esc(t.data.任务编号)}"></td><td><div class="task-cell">${showThumbs&&t.plan?`<a class="thumb-link" href="/viewer?task=${encodeURIComponent(t.id)}&image=${encodeURIComponent(t.data.要处理的图片)}" target="_blank" rel="noopener" aria-label="查看 ${esc(t.data.要处理的图片)}"><img class="task-thumbnail" loading="lazy" decoding="async" width="44" height="44" alt="${esc(t.data.要处理的图片)}" src="/api/thumbnail?task=${encodeURIComponent(t.id)}&image=${encodeURIComponent(t.data.要处理的图片)}&v=${encodeURIComponent(t.fingerprint)}"></a>`:''}<div><div class="task-number">${esc(t.data.任务编号||'无编号')}</div><div class="task-desc" title="${esc(t.folder)}">${esc(t.folderName)}</div></div></div></td><td><div>${esc(t.data.要处理的图片||'未指定')}</div><div class="task-desc">${refs.length?`参考：${refs.map(esc).join('、')}`:'无参考图'}</div></td><td><span class="category-tag ${t.data.处理分类==='局部重绘-gpt'?'gpt':''}">${esc(t.data.处理分类||'未分类')}</span><div class="task-desc">${esc(live.includes(t.status)?t.latestJob?.providerName:t.providerName)}</div></td><td>${esc(t.data.输出比例??'模型自适应')}</td><td title="${esc(issue)}">${statusBadge(t.status)}</td><td>${button('详情','detail',t.id)}</td></tr>`;
  }).join('');
  if(rows!==lastRows){$('#task-rows').innerHTML=rows;lastRows=rows;}
  $('#pagination').innerHTML=`${button('上一页','prev-page')}<span>第 ${taskPage} / ${Math.max(1,Math.ceil(tasks.length/pageSize))} 页</span>${button('下一页','next-page')}`;
  $('#pagination [data-action="prev-page"]').disabled=taskPage===1;
  $('#pagination [data-action="next-page"]').disabled=taskPage*pageSize>=tasks.length;
  $('#empty-state').innerHTML=tasks.length?'':`<div class="empty"><div class="empty-mark">▱</div><h3>${state.tasks.length?'没有符合筛选条件的任务':'从一个需求文件夹开始'}</h3><p>${state.tasks.length?'调整筛选条件，查看其他任务。':'导入后，每条作图需求会在这里显示为一行。'}</p>${state.tasks.length?'':button('载入示例，查看编号转换','demo')}<div class="workflow-strip"><span>读取需求</span><b>→</b><span>匹配能力</span><b>→</b><span>转换编号</span><b>→</b><span>生成回存</span></div></div>`;
  $('#table-summary').textContent=`共 ${tasks.length} 条 · 每页 ${pageSize} 条 · 已选 ${[...selected].filter(id=>state.tasks.some(t=>t.id===id)).length} 条`;
  const queue=state.jobs.filter(j=>j.status==='queued').length;
  $('#queue-controls').innerHTML=`${state.active?`正在执行 ${state.active} 条 · `:''}${queue?`等待 ${queue} 条 · `:''}${button(state.paused?'继续队列':'暂停新提交','toggle-queue')}`;
  $('#queue-banner').innerHTML=state.active||queue?`<div class="queue-line"><span class="live-dot"></span>${state.paused?'已暂停新提交，已提交任务继续接收结果。':`队列运行中，同时执行上限 ${state.concurrency} 条。`}</div>`:'';
  $('#select-all').checked=visibleTasks().length>0&&visibleTasks().every(t=>selected.has(t.id));
}
function renderSettings(){
  const profiles=['gemini','gpt'].map(id=>state.providers.find(p=>p.id===id)).filter(Boolean);
  $('#main').innerHTML=heading('RUNNINGHUB ACCOUNT','一个 Key，连接两个模型。','填写一次账户 API Key，在批量任务页选择使用的模型。')+
    `${state.credentialNotice?`<div class="notice error">${esc(state.credentialNotice)}</div>`:''}<div class="account-layout"><section class="panel account-panel"><div class="panel-header"><div class="provider-heading"><span class="provider-icon">R</span><div><h2 class="model-title">RunningHub</h2><span class="panel-caption">账户共享凭据</span></div></div><span class="key-state ${state.hasKey?'saved':''}">${state.hasKey?'已保存':'待填写'}</span></div><div class="form-body"><div class="field"><label for="account-key">API Key</label><div class="key-row"><input id="account-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="${state.hasKey?'留空保留已保存的 Key':'粘贴 RunningHub API Key'}"><button class="button" data-action="toggle-key" aria-label="显示或隐藏 API Key">显示</button></div><div class="field-note">两个模型共用，用于素材上传、生成和结果查询。</div></div>${state.hasKey?'<label class="scan-option"><input id="clear-key" type="checkbox">清除已保存的 Key</label>':''}<div class="account-save"><span class="field-note">在本机加密保存，保存后不回显。</span>${button('保存 API Key','save-settings','','primary')}</div><p class="key-disclaimer">保存只检查填写格式；实际可用性在执行任务时确认。</p></div></section><section class="panel routing-panel"><div class="panel-header"><div><div class="panel-title">模型如何切换</div><div class="panel-caption">API Key 验证账户，调用接口决定模型。</div></div></div><div class="form-body"><p class="route-intro">批量任务页默认按处理分类自动选择，也可手动指定一个模型执行本次任务。</p>${profiles.map(p=>`<div class="route-row"><span class="route-letter ${p.id==='gpt'?'gpt':''}">${p.id==='gpt'?'G':'N'}</span><div><strong>${esc(p.name)}</strong><div class="task-desc">${esc(p.category)} · 单图 ≤ ${p.maxImageBytes/1024/1024}MB</div></div><a href="${esc(p.docUrl)}" target="_blank" rel="noopener" aria-label="${esc(p.name)} 调用说明">↗</a></div>`).join('')}<p class="route-note">切换仅影响新提交的任务。已加入队列的任务继续使用原模型。</p></div></section></div><div class="quiet-note"><span>↳</span><p>图片引用自动对应实际输入顺序。输出比例为空时，由模型自适应；结果自动保存到对应需求的 AI 文件夹。</p><button class="text-button" data-page="tasks">返回批量任务 →</button></div>`;
}
function collectSettings(){
  return {apiKey:$('#account-key').value,clearKey:!!$('#clear-key')?.checked};
}
function renderHistory(){
  $('#main').innerHTML=heading('GENERATION JOURNAL','运行记录','查看实际使用的模型、提示词与结果保存位置。',button('↻ 刷新','refresh'))+`<section class="panel"><div class="toolbar"><span class="panel-title">最近 300 条执行记录</span><span class="subtitle">可继续查询已提交任务</span></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>模型 / 时间</th><th>RunningHub taskId</th><th>状态</th><th>操作</th></tr></thead><tbody id="history-rows"></tbody></table></div><div id="history-empty"></div></section>`;updateHistory();
}
function updateHistory(){
  if(!$('#history-rows'))return;
  $('#history-rows').innerHTML=state.jobs.map(j=>`<tr><td><strong>${esc(j.taskNumber)}</strong><div class="task-desc" title="${esc(j.folder)}">${esc(j.folderName)}</div></td><td>${esc(j.providerName)}<div class="task-desc">${new Date(j.createdAt).toLocaleString('zh-CN',{hour12:false})}</div></td><td class="mono history-cell">${esc(j.remoteId||'尚未取得远程编号')}</td><td>${statusBadge(j.status)}${j.error?`<div class="history-error">${esc(j.error)}</div>`:''}</td><td><div class="button-group">${button('执行详情','job',j.id)}${j.canResume&&['failed','uncertain'].includes(j.status)?button('继续查询 / 下载','resume-job',j.id):''}${j.resultPath?`<a class="button small" target="_blank" rel="noopener" href="/viewer?job=${encodeURIComponent(j.id)}">打开结果</a>`:''}</div></td></tr>`).join('');
  $('#history-empty').innerHTML=state.jobs.length?'':'<div class="empty"><div class="empty-mark">◷</div><h3>还没有执行记录</h3><p>先导入需求，配置能力，再选择一条任务试运行。</p></div>';
}
function mappingTable(plan){return `<div class="table-wrap mapping-table"><table><thead><tr><th>模型输入顺序</th><th>文件夹中的素材</th><th>用途</th></tr></thead><tbody>${(plan?.mapping||[]).map(row=>`<tr><td><strong>${esc(row.local)}</strong></td><td>${esc(row.global)}</td><td>${row.role}</td></tr>`).join('')}</tbody></table></div>`;}
function openDetail(id,jobMode=false){
  detail={id,jobMode};const job=jobMode?state.jobs.find(j=>j.id===id):null,task=jobMode?null:state.tasks.find(t=>t.id===id),item=job||task;
  if(!item){toast('记录不存在，请刷新');return;}
  const executing=task&&live.includes(task.status),last=job||task.latestJob;
  const plan=job?.plan||(executing?last?.plan:task?.plan),errors=job?[job.error].filter(Boolean):[...task.errors,...task.configErrors,task.latestJob?.error].filter(Boolean);
  $('#detail-title').textContent=`${job?.taskNumber||task.data.任务编号} · ${jobMode?'执行记录':'任务详情'}`;
  $('#detail-body').innerHTML=`<div class="detail-content"><div class="detail-meta">${esc(item.folder)}<br>${jobMode||executing?'执行模型':'新任务模型'}：${esc(job?.providerName||(executing?last?.providerName:task.providerName)||'待配置')} · ${statusBadge(item.status)} · 比例：${esc(plan?.ratio??'模型自适应（不传比例参数）')}</div>
  ${errors.length?`<div class="notice error">${esc([...new Set(errors)].join('\n'))}</div>`:''}
  <span class="section-label">图片编号映射 · 按实际发送顺序</span>${mappingTable(plan)}
  <div class="prompt-grid detail-section"><div><span class="section-label">${jobMode?'本次执行要求（文件夹编号）':'本次执行要求（可编辑，使用文件夹编号）'}</span>${jobMode?`<div class="prompt-box">${esc(plan?.effectivePrompt||'')}</div>`:`<textarea id="override-prompt" rows="7">${esc(task.override||task.data.具体要求||'')}</textarea><div class="field-note">保存后重新生成编号映射，不修改原始 JSON。</div>`}</div><div><span class="section-label">${jobMode?'实际发送提示词':'发送提示词预览'}</span><div class="prompt-box">${esc(plan?.prompt||'请先修正任务内容')}</div></div></div>
  ${!jobMode?`<details class="advanced"><summary>查看 JSON 中的原始要求</summary><div class="prompt-box">${esc(task.data.具体要求)}</div></details>`:''}
  ${last?.remoteId?`<div class="detail-section"><span class="section-label">最近执行 · ${esc(last.providerName)} · RunningHub 任务编号</span><span class="mono">${esc(last.remoteId)}</span></div>`:''}
  ${last?.resultPath?`<div class="detail-section"><span class="section-label">结果已保存</span><div class="small-path">${esc(last.resultPath)}</div><a class="button small" target="_blank" rel="noopener" href="/viewer?job=${encodeURIComponent(last.id)}">打开完整结果</a>${last.resultCount>1?`<p class="field-note">接口返回 ${last.resultCount} 张图片，按配置的输出索引保存一张。</p>`:''}</div>`:''}
  <div class="detail-actions">${!jobMode?button('保存修改并更新预览','save-override',task.id):''}${!jobMode&&!live.includes(task.status)?button(task.status==='completed'?'重新生成一张':task.status==='uncertain'?'核对后重新生成':'执行本任务','run-one',task.id,'primary'):''}${last?.canResume&&['failed','uncertain'].includes(last.status)?button('继续查询 / 下载原任务','resume-job',last.id):''}${!jobMode?button('打开需求文件夹','open-folder',task.id):''}${!jobMode?button('打开 AI 文件夹','open-output',task.id):''}${button('刷新详情','refresh-detail')}</div></div>`;
  if(!jobMode&&task.status==='failed'&&task.latestJob?.canResume)$('.detail-actions').insertAdjacentHTML('beforeend',button('重新生成一张','rerun-one',task.id));
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
}
async function start(ids,force=false){if(!ids.length)throw new Error('请先选择可执行任务');const result=await api('/api/start',{ids,force,modelChoice});await refresh();toast(`已加入 ${result.added} 条任务 · ${modelLabel()}${result.skipped.length?'\n'+result.skipped.join('\n'):''}`);if(detail&&!detail.jobMode&&$('#detail-dialog').open)openDetail(detail.id);}
async function importPaths(paths){
  const result=await api('/api/import',{paths,recursive:$('#recursive')?.checked??true});await refresh();
  $('#report').innerHTML=`<div class="notice ${result.warnings.length?'':'success'}">导入 ${result.folders} 个文件夹，新增 ${result.added} 条，更新 ${result.updated} 条。${result.warnings.length?'\n'+result.warnings.map(esc).join('\n'):''}</div>`;
  toast(`导入完成：${result.added} 条新增任务`);
}
document.addEventListener('input',e=>{if(e.target.id==='paths')pathDraft=e.target.value;if(['search','category-filter','status-filter'].includes(e.target.id)){taskPage=1;updateTasks();}});
document.addEventListener('change',e=>{
  if(e.target.id==='show-thumbnails'){showThumbs=e.target.checked;updateTasks();}
  if(e.target.id==='model-choice'){
    if(busy){e.target.value=modelChoice;return;}
    const previous=modelChoice;modelChoice=e.target.value;busy=true;
    refresh().then(()=>toast(`新任务模型：${modelLabel()}`)).catch(error=>{modelChoice=previous;e.target.value=previous;toast(error.message);}).finally(()=>{busy=false;});
  }
  if(e.target.dataset.select){if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select);updateTasks();}
  if(e.target.id==='select-all'){for(const task of visibleTasks())if(e.target.checked)selected.add(task.id);else selected.delete(task.id);updateTasks();}

});
document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-page]');if(nav){go(nav.dataset.page);return;}
  const control=e.target.closest('[data-action]');if(!control||busy)return;
  const {action,id}=control.dataset;
  try{
    busy=true;control.disabled=true;
    if(action==='prev-page'){taskPage=Math.max(1,taskPage-1);updateTasks();}
    if(action==='next-page'){taskPage++;updateTasks();}
    if(action==='refresh')await refresh();
    if(action==='pick'){const initial=$('#paths').value.split(/\r?\n/).map(p=>p.trim()).filter(Boolean).at(-1)||'';const result=await api('/api/pick-folder',{initial});if(result.path){const paths=$('#paths').value.split(/\r?\n/).map(p=>p.trim()).filter(Boolean);if(!paths.includes(result.path))paths.push(result.path);$('#paths').value=paths.join('\n');pathDraft=$('#paths').value;toast('已选择文件夹，点击扫描并导入');}}
    if(action==='toggle-key'){const input=$('#account-key');input.type=input.type==='password'?'text':'password';control.textContent=input.type==='password'?'显示':'隐藏';}
    if(action==='import'){const paths=$('#paths').value.split(/\r?\n/).map(p=>p.trim()).filter(Boolean);if(!paths.length)throw new Error('请先粘贴文件夹的完整路径');await importPaths(paths);}
    if(action==='demo')await importPaths([state.examplePath]);
    if(action==='detail')openDetail(id);
    if(action==='job')openDetail(id,true);
    if(action==='refresh-detail'){await refresh();openDetail(detail.id,detail.jobMode);}
    if(action==='run-all')await start(state.tasks.filter(t=>t.status==='ready').map(t=>t.id));
    if(action==='run-selected'){const tasks=state.tasks.filter(t=>selected.has(t.id));if(tasks.some(t=>['completed','uncertain'].includes(t.status)))throw new Error('已完成或待核对任务请在详情中单独选择重新生成');await start(tasks.map(t=>t.id));}
    if(action==='rerun-one'){
      if(confirm('将新增一次 RunningHub 生图任务并保存新版本，是否继续？'))await start([id],true);
    }
    if(action==='run-one'){
      const task=state.tasks.find(t=>t.id===id);let force=false;
      if(['completed','uncertain'].includes(task.status)){if(!confirm(task.status==='uncertain'?'请确认已核对 RunningHub 记录。重新生成可能产生新的计费任务，是否继续？':'将新增一次生成并保存新版本，是否继续？'))return;force=true;}
      if(task.status==='failed'&&task.latestJob?.canResume){throw new Error('请先继续查询 / 下载原任务；需要新生成时可重新导入或修改执行要求。');}
      await start([id],force);
    }
    if(action==='toggle-queue'){await api('/api/pause',{paused:!state.paused});await refresh();}
    if(action==='resume-job'){await api('/api/resume-job',{id});await refresh();toast('已恢复原任务，不重复提交生图');if(detail&&$('#detail-dialog').open)openDetail(detail.id,detail.jobMode);}
    if(action==='save-override'){await api('/api/override',{id,prompt:$('#override-prompt').value});await refresh();openDetail(id);toast('已保存执行要求并更新编号');}
    if(action==='open-folder'||action==='open-output'){await api('/api/open-folder',{id,output:action==='open-output'});toast('已请求 Windows 打开文件夹');}
    if(action==='remove'){if(!selected.size)throw new Error('请先选择任务');if(confirm('只从工作台移除选中任务，磁盘上的需求和结果保留。继续？')){const r=await api('/api/remove',{ids:[...selected]});selected.clear();await refresh();toast(`移除 ${r.removed} 条任务`);}}
    if(action==='save-settings'){await api('/api/account',collectSettings());await refresh();if(page==='settings')renderSettings();toast(state.hasKey?'共享 API Key 已保存':'共享 API Key 已清除');}
  }catch(error){toast(error.message);}finally{busy=false;control.disabled=false;}
});
$('#close-detail').addEventListener('click',()=>{$('#detail-dialog').close();detail=null;});
$('#detail-dialog').addEventListener('click',e=>{if(e.target===$('#detail-dialog')){$('#detail-dialog').close();detail=null;}});
try{await refresh();go('tasks');}catch(e){$('#main').innerHTML=`<div class="notice error">连接本地服务失败：${esc(e.message)}。请启动工作台后刷新页面。</div>`;}
setInterval(async()=>{if(busy||!state)return;try{await refresh();}catch{$('#connection').textContent='本地服务暂时断开，请检查启动状态';}},2500);
