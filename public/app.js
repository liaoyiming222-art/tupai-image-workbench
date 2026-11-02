import {isDemo,request,thumbnailUrl,viewerUrl} from './transport.mjs';
const $ = (s, root=document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {ready:'待执行',invalid:'待修正',unconfigured:'待配置',queued:'排队中',uploading:'上传中',submitting:'提交中',polling:'生成中',saving:'保存中',completed:'已完成',failed:'失败',uncertain:'待核对',missing:'结果缺失'};
const live = ['queued','uploading','submitting','polling','saving'];
const categories = ['局部重绘-Gemini','局部重绘-gpt'];
let state, page='tasks', detail, busy=false, toastTimer, modelChoice='auto', taskPage=1, showThumbs=true, lastRows='';
const pageSize=50;
const visibleTasks=()=>filteredTasks().slice((taskPage-1)*pageSize,taskPage*pageSize);
const modelLabel=()=>({auto:'按处理分类自动选择',gemini:'Nano Banana 2',gpt:'GPT Image 2.0'}[modelChoice]);
const currentBatch=()=>state.batches?.find(b=>b.id===state.currentBatchId);
const batchTasks=()=>state.batches?state.tasks.filter(t=>currentBatch()?.taskIds.includes(t.id)):state.tasks;
const selected=new Set();
let pendingFolders=[],pickerBusy=false;

const statusBadge = status => `<span class="status ${esc(status)}">${esc(labels[status] || status)}</span>`;
const button = (text, action, id='', cls='') => `<button class="button small ${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),6000);}
function askDialog(message,initial){
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='action-dialog';dialog.setAttribute('aria-label',initial===undefined?'确认操作':'单图节约时间');
    dialog.innerHTML='<form><p class="action-message"></p><label class="action-input" hidden>每张图片节约分钟数<input type="number" min="0.001" max="1440" step="any" required aria-label="每张图片节约分钟数"></label><div class="button-group"><button type="button" class="button" data-cancel>取消</button><button type="submit" class="button primary">确认</button></div></form>';
    dialog.querySelector('.action-message').textContent=message;
    const input=dialog.querySelector('input');if(initial!==undefined){dialog.querySelector('label').hidden=false;input.value=initial;}else input.disabled=true;
    let result=null;dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('form').onsubmit=e=>{e.preventDefault();result=initial===undefined?true:input.value;dialog.close();};
    dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});document.body.append(dialog);dialog.showModal();
  });
}
const confirmAction=async message=>!!await askDialog(message);
const promptNumber=(message,value)=>askDialog(message,value);
async function api(route,body){return request(route,body,state?.token||'');}
async function refresh(){
  const choice=modelChoice,next=await api('/api/state?modelChoice='+encodeURIComponent(choice));if(choice!==modelChoice)return;
  if(!isDemo&&next.apiRevision!==3)throw new Error('页面与后台服务版本不一致。请等待作图结束，使用“停止工作台”后重新启动；只关闭页面不会停止后台服务。');
  if(state&&state.currentBatchId!==next.currentBatchId){selected.clear();taskPage=1;}
  state=next;$('#connection').textContent=isDemo?'在线演示 · 模拟数据':'本地服务已连接';$('#nav-count').textContent=batchTasks().length;
  $('#account-status').textContent=state.hasKey?(isDemo?'虚拟 Key 已配置':'API Key 已保存'):(isDemo?'演示配置待保存':'API Key 待配置');$('#account-status').classList.toggle('configured',state.hasKey);
  if(page==='tasks')updateTasks();else if(page==='history')updateHistory();else if(page==='dashboard')await updateDashboard();
}
function heading(title,actions=''){return `<div class="page-heading"><h1>${title}</h1><div class="button-group">${actions}</div></div>`;}
function go(next){page=next;document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#page-label').textContent={tasks:'批量任务',settings:'API 设置',history:'运行记录',dashboard:'数据看板'}[page];if(page==='tasks')renderTasks();else if(page==='settings')renderSettings();else if(page==='dashboard')renderDashboard().catch(error=>toast(error.message));else renderHistory();window.scrollTo({top:0,left:0});}
function renderTasks(){
  lastRows='';
  $('#main').innerHTML=heading('批量任务',button('↻ 刷新','refresh'))+
    `<section class="panel import-panel" id="folder-dropzone" tabindex="0" role="region" aria-label="文件夹导入区，支持 Ctrl+V 粘贴文件夹"><div class="import-body"><div class="import-row"><strong class="panel-title">导入需求</strong><div class="button-group">${button('粘贴文件夹','paste-folders')}${button('选择文件夹','pick')}${button('取消目录选择','cancel-picker')}</div><span id="folder-count" class="muted"></span><span class="paste-hint">支持 Ctrl+V</span></div><div id="folder-list"></div><div class="import-actions"><label class="scan-option"><input type="checkbox" id="recursive" checked>扫描子文件夹</label><div class="button-group">${button('清空','clear-folders')}${button('扫描并导入','import','','primary')}</div></div><div id="report" aria-live="polite"></div></div></section>
    <section class="panel task-panel"><div class="task-panel-heading"><div class="list-heading"><strong class="panel-title">任务列表</strong><span id="task-count" class="muted"></span></div><details class="list-menu"><summary>列表操作</summary>${button('移除当前列表全部','remove-batch','','danger')}</details></div><div class="toolbar task-filters"><div class="filters"><input id="search" placeholder="搜索任务或要求…" aria-label="搜索任务"><select id="category-filter" class="category-filter" aria-label="处理分类"><option value="">全部分类</option>${categories.map(c=>`<option>${c}</option>`).join('')}</select><select id="status-filter" aria-label="执行状态"><option value="">全部状态</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><label class="scan-option"><input id="show-thumbnails" type="checkbox" ${showThumbs?'checked':''}>主图缩略图</label></div><div class="toolbar execution-toolbar"><label class="model-control">生成模型 <select id="model-choice">${[['auto','按处理分类自动选择'],['gemini','Nano Banana 2'],['gpt','GPT Image 2.0']].map(([id,name])=>`<option value="${id}" ${modelChoice===id?'selected':''}>${name}</option>`).join('')}</select></label><span id="model-account"></span><div class="button-group">${button('移除选中','remove')}${button('执行选中','run-selected')}${button('执行全部就绪','run-all','','primary')}</div></div>
    <div id="queue-banner"></div><div class="table-wrap"><table><thead><tr><th><input id="select-all" type="checkbox" aria-label="选择本页任务"></th><th>任务 / 所属需求</th><th>输入素材</th><th>分类 / 本次模型</th><th>输出比例</th><th>状态</th><th>操作</th></tr></thead><tbody id="task-rows"></tbody></table></div><div id="empty-state"></div><div class="table-footer"><span id="table-summary"></span><span id="pagination" class="button-group"></span><span id="queue-controls"></span></div></section>`;
  renderFolderList();updateTasks();
}
function filteredTasks(){const q=$('#search')?.value.toLowerCase()||'',cat=$('#category-filter')?.value||'',s=$('#status-filter')?.value||'';return batchTasks().filter(t=>(!cat||t.data.处理分类===cat)&&(!s||t.status===s)&&(!q||`${t.folder} ${t.data.任务编号} ${t.data.具体要求}`.toLowerCase().includes(q)));}
function updateTasks(){
  if(!$('#task-rows'))return;
  const tasks=filteredTasks(),done=batchTasks().filter(t=>t.status==='completed').length,problems=batchTasks().filter(t=>['invalid','unconfigured','failed','uncertain','missing'].includes(t.status)).length;
  const currentIds=new Set(batchTasks().map(t=>t.id));for(const id of selected)if(!currentIds.has(id))selected.delete(id);
  $('#task-count').textContent=`${batchTasks().length} 条 · 已完成 ${done} · 需要处理 ${problems}`;
  $('#model-account').innerHTML=state.hasKey?'':'<button class="text-button" data-page="settings">请先配置 API Key ↗</button>';
  $('[data-action="remove"]').hidden=!selected.size;
  $('[data-action="run-selected"]').disabled=!selected.size||!state.hasKey;
  $('[data-action="run-all"]').disabled=!state.hasKey||!batchTasks().some(t=>t.status==='ready');
  $('[data-action="remove-batch"]').disabled=!batchTasks().length;
  taskPage=Math.min(taskPage,Math.max(1,Math.ceil(tasks.length/pageSize)));
  const rows=visibleTasks().map(t=>{
    const refs=Array.isArray(t.data.参考图编号)?t.data.参考图编号:[],issue=[...t.errors,...t.configErrors,t.latestJob?.error].filter(Boolean).join('；');
    return `<tr><td><input type="checkbox" data-select="${t.id}" ${selected.has(t.id)?'checked':''} aria-label="选择 ${esc(t.data.任务编号)}"></td><td><div class="task-cell">${showThumbs&&t.plan?`<a class="thumb-link" href="${esc(viewerUrl(t))}" target="_blank" rel="noopener" aria-label="查看 ${esc(t.data.要处理的图片)}"><img class="task-thumbnail" loading="lazy" decoding="async" width="44" height="44" alt="${esc(t.data.要处理的图片)}" src="${esc(thumbnailUrl(t))}"></a>`:''}<div><div class="task-number">${esc(t.data.任务编号||'无编号')}</div><div class="task-desc" title="${esc(t.folder)}">${esc(t.folderName)}</div></div></div></td><td><div>${esc(t.data.要处理的图片||'未指定')}</div><div class="task-desc">${refs.length?`参考：${refs.map(esc).join('、')}`:'无参考图'}</div></td><td><span class="category-tag ${t.data.处理分类==='局部重绘-gpt'?'gpt':''}">${esc(t.data.处理分类||'未分类')}</span><div class="task-desc">${esc(live.includes(t.status)?t.latestJob?.providerName:t.providerName)}</div></td><td>${esc(t.data.输出比例??'模型自适应')}</td><td title="${esc(issue)}">${statusBadge(t.status)}</td><td>${button('详情','detail',t.id)}</td></tr>`;
  }).join('');
  if(rows!==lastRows){$('#task-rows').innerHTML=rows;lastRows=rows;}
  $('#pagination').innerHTML=`${button('上一页','prev-page')}<span>第 ${taskPage} / ${Math.max(1,Math.ceil(tasks.length/pageSize))} 页</span>${button('下一页','next-page')}`;
  $('#pagination [data-action="prev-page"]').disabled=taskPage===1;
  $('#pagination [data-action="next-page"]').disabled=taskPage*pageSize>=tasks.length;
  $('#empty-state').innerHTML=tasks.length?'':`<div class="empty"><h3>${batchTasks().length?'没有符合筛选条件的任务':'从一个需求文件夹开始'}</h3><p>${batchTasks().length?'调整筛选条件，查看其他任务。':'粘贴或选择文件夹，再点击扫描并导入。'}</p>${batchTasks().length?'':button('载入示例','demo')}</div>`;
  $('#table-summary').textContent=`共 ${tasks.length} 条 · 每页 ${pageSize} 条 · 已选 ${[...selected].filter(id=>state.tasks.some(t=>t.id===id)).length} 条`;
  const queue=state.queueCount??state.jobs.filter(j=>j.status==='queued').length;
  const elsewhere=state.otherBatchActive||0;
  $('#queue-controls').innerHTML=state.active||queue?`${state.active?`正在执行 ${state.active} 条 · `:''}${queue?`等待 ${queue} 条 · `:''}${button(state.paused?'继续队列':'暂停新提交','toggle-queue')}`:'';
  $('#queue-banner').innerHTML=elsewhere?`<div class="queue-line">其他批次仍有 ${elsewhere} 条任务排队或执行中 ${button('查看运行记录','other-jobs')}</div>`:state.active||queue?`<div class="queue-line"><span class="live-dot"></span>${state.paused?'已暂停新提交，已提交任务继续接收结果。':`队列运行中，同时执行上限 ${state.concurrency} 条。`}</div>`:'';
  $('#select-all').checked=visibleTasks().length>0&&visibleTasks().every(t=>selected.has(t.id));
}
function renderSettings(){
  const profiles=['gemini','gpt'].map(id=>state.providers.find(p=>p.id===id)).filter(Boolean);
  $('#main').innerHTML=heading('API 设置')+`${state.credentialNotice?`<div class="notice error">${esc(state.credentialNotice)}</div>`:''}
  <div class="account-layout"><section class="panel account-panel"><div class="panel-header"><strong class="panel-title">RunningHub</strong><span class="key-state ${state.hasKey?'saved':''}">${state.hasKey?'已保存':'待填写'}</span></div><div class="form-body"><div class="field"><label for="account-key">API Key</label><div class="key-row"><input id="account-key" ${isDemo?'readonly value="DEMO-ONLY-NOT-A-REAL-KEY"':''} type="password" autocomplete="new-password" spellcheck="false" placeholder="${state.hasKey?'留空保留已保存的 Key':'粘贴 RunningHub API Key'}"><button class="button" data-action="toggle-key" aria-label="显示或隐藏 API Key">显示</button></div></div><div class="account-save"><span class="field-note">${isDemo?'演示版使用虚拟 Key，不接收真实凭据。':'在本机加密保存，保存后不回显。'}</span>${button('保存 API Key','save-settings','','primary')}</div><p class="key-disclaimer">保存不代表已验证可调用，实际可用性在执行任务时确认。</p>${state.hasKey?`<details class="key-management"><summary>管理已保存的 Key</summary>${button('清除已保存的 Key','clear-key','','danger')}</details>`:''}</div></section>
  <section class="model-routing"><strong class="panel-title">模型对应关系</strong>${profiles.map(p=>`<div class="route-row"><span>${esc(p.category)}</span><strong>${esc(p.name)}</strong><a href="${esc(p.docUrl)}" target="_blank" rel="noopener">调用说明 ↗</a></div>`).join('')}<p class="field-note">两个模型共用一个 Key；在批量任务页选择模型，仅影响新提交的任务。</p></section></div>`;
}
function collectSettings(){
  return isDemo?{}:{apiKey:$('#account-key').value};
}
let historyPage=1,historyStatus='',historySequence=0,historyJobs=[];
const dateToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
function dateFilters(){const today=dateToday();return '<label>时间<select id="range-preset" aria-label="时间范围"><option value="month">本月</option><option value="today">今天</option><option value="week">近7天</option><option value="30">近30天</option><option value="all">全部</option><option value="custom">自定义</option></select></label><label>开始日期<input type="date" id="report-from" aria-label="开始日期" value="'+today.slice(0,7)+'-01"></label><span>至</span><label>结束日期<input type="date" id="report-to" aria-label="结束日期" value="'+today+'"></label>';}
function reportParams(){const params=new URLSearchParams();for(const [key,id] of [['from','report-from'],['to','report-to'],['model','history-model'],['q','history-search'],['batch','history-batch'],['category','history-category']]){const v=$('#'+id)?.value;if(v)params.set(key,v);}return params;}
function renderHistory(){
  historyPage=1;historyStatus='';
  $('#main').innerHTML=heading('运行记录',button('↻ 刷新','refresh'))+`<section class="panel history-panel"><div class="report-filters"><div class="date-filters">${dateFilters()}</div><div class="history-filter-row"><label>模型<select id="history-model" aria-label="执行模型"><option value="">全部模型</option>${state.providers.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')}</select></label><label>批次<select id="history-batch" aria-label="导入批次"><option value="">全部批次</option>${(state.batches||[]).slice().reverse().map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('')}</select></label><label>分类<select id="history-category" aria-label="处理分类"><option value="">全部分类</option>${categories.map(c=>'<option>'+esc(c)+'</option>').join('')}</select></label><label class="history-search">搜索<input id="history-search" placeholder="任务、文件夹或远程编号" aria-label="搜索运行记录"></label></div></div><div class="toolbar" id="history-tabs" aria-label="执行状态筛选"></div><div class="table-wrap"><table><thead><tr><th>任务 / 所属需求</th><th>实际模型</th><th>执行时间</th><th>状态 / 原因</th><th>操作</th></tr></thead><tbody id="history-rows"></tbody></table></div><div class="toolbar" id="history-pagination"></div></section>`;updateHistory();
}
async function updateHistory(){if(!$('#history-rows'))return;const sequence=++historySequence,params=reportParams();params.set('page',historyPage);params.set('status',historyStatus);try{const r=await api('/api/history?'+params);if(sequence!==historySequence||!$('#history-rows'))return;historyJobs=r.jobs;historyPage=r.page;$('#history-tabs').innerHTML=[['','全部',r.counts.all],['live','进行中',r.counts.live],['completed','已完成',r.counts.completed],['failed','失败',r.counts.failed],['uncertain','待核对',r.counts.uncertain]].map(([value,label,count])=>button(label+' '+count,'history-status',value,historyStatus===value?'primary':'')).join('');$('#history-rows').innerHTML=r.jobs.map(j=>`<tr><td><strong>${esc(j.taskNumber)}</strong><div class="task-desc" title="${esc(j.folder)}">${esc(j.folderName)}</div></td><td>${esc(j.providerName)}</td><td>${new Date(j.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</td><td>${statusBadge(j.status)}<div class="history-error error-summary" title="${esc(j.error)}">${esc(j.error)}</div></td><td><div class="button-group">${button('执行详情','job',j.id)}${j.canResume&&['failed','uncertain'].includes(j.status)?button('继续查询 / 下载','resume-job',j.id):''}${j.resultPath?'<a class="button small" href="'+esc(viewerUrl(j,true))+'">查看结果</a>':''}</div></td></tr>`).join('')||'<tr><td colspan="5">没有符合条件的执行记录</td></tr>';$('#history-pagination').innerHTML=button('上一页','history-prev')+'<span>共 '+r.total+' 条 · 第 '+r.page+' / '+r.pages+' 页</span>'+button('下一页','history-next');$('[data-action="history-prev"]').disabled=r.page<=1;$('[data-action="history-next"]').disabled=r.page>=r.pages;}catch(error){toast(error.message);}}
let reportGrain='day',dashboardSequence=0,savedMinutes=10;
async function renderDashboard(){$('#main').innerHTML=heading('数据看板',button('↻ 刷新','dashboard-refresh'))+'<section class="panel report-filters date-filters">'+dateFilters()+'</section><div id="dashboard-content"></div>';await updateDashboard();}
const duration=minutes=>minutes>=60?(minutes/60).toLocaleString('zh-CN',{maximumFractionDigits:1})+' 小时':minutes.toLocaleString('zh-CN',{maximumFractionDigits:1})+' 分钟';
async function updateDashboard(){const target=$('#dashboard-content');if(!target)return;const sequence=++dashboardSequence;const r=await api('/api/dashboard?'+reportParams());if(sequence!==dashboardSequence||target!==$('#dashboard-content'))return;savedMinutes=r.minutes;const signature=JSON.stringify(r)+reportGrain;if(target.dataset.signature===signature)return;target.dataset.signature=signature;const cards=[['成功出图',r.images+' 张','已成功保存的产出'],['预计节约时间',duration(r.images*r.minutes),'按每张 '+r.minutes+' 分钟估算'],['生图提交次数',r.submissions+' 次','不含上传、查询与下载'],['执行成功率',r.successRate===null?'—':r.successRate+'%','成功保存 /（已完成＋失败）']];target.innerHTML='<div class="stats">'+cards.map(([label,value,note])=>'<div class="stat"><div class="stat-label">'+label+(label==='预计节约时间'?button('调整','time-setting','','ghost'):'')+'</div><div class="stat-value">'+value+'</div><div class="stat-note">'+note+'</div>'+'</div>').join('')+'</div><div class="report-grid"><section class="panel report-panel"><div class="panel-title">出图趋势 <select id="trend-grain" aria-label="趋势粒度"><option value="day">按日</option><option value="month">按月</option></select></div><div id="production-chart"></div></section><section class="panel report-panel"><div class="panel-title">模型使用</div><div class="table-wrap"><table><thead><tr><th>模型</th><th>提交</th><th>出图</th><th>成功率</th></tr></thead><tbody>'+r.models.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+m.submissions+'</td><td>'+m.images+'</td><td>'+(m.successRate===null?'—':m.successRate+'%')+'</td></tr>').join('')+'</tbody></table></div></section></div><details class="panel report-panel"><summary>最近12个月产出汇总（全部记录）</summary><table><thead><tr><th>月份</th><th>成功出图</th><th>预计节约时间</th></tr></thead><tbody>'+r.months.slice().reverse().map(m=>'<tr><td>'+m.month+'</td><td>'+m.images+'</td><td>'+duration(m.minutes)+'</td></tr>').join('')+'</tbody></table></details><details class="metric-notes"><summary>统计口径说明</summary><p>按执行创建日期归属产出，时间使用北京时间；成功出图按保存记录去重，文件移动或删除不扣减历史产出。提交次数不含上传、查询与下载；成功率 = 成功保存 /（已完成＋失败）。预计节约时间按当前设置计算。</p></details>'+(r.estimatedHistory?'<p class="field-note">旧记录提交次数根据远程编号估算，可能少于真实请求次数。</p>':'');
$('#trend-grain').value=reportGrain;const aggregated=new Map();for(const [date,count] of r.trend){const key=reportGrain==='month'?date.slice(0,7):date;aggregated.set(key,(aggregated.get(key)||0)+count);}const rows=[...aggregated],max=Math.max(1,...rows.map(x=>x[1]));$('#production-chart').innerHTML=rows.length?'<div class="trend-bars">'+rows.map(([date,count])=>'<div class="trend-item"><span>'+date+'</span><div class="trend-track"><div></div></div><strong>'+count+'</strong></div>').join('')+'</div>':'<div class="empty">所选时间暂无产出记录</div>';document.querySelectorAll('.trend-track div').forEach((el,i)=>el.style.width=(rows[i][1]/max*100)+'%');}
function mappingTable(plan){return `<div class="table-wrap mapping-table"><table><thead><tr><th>模型输入顺序</th><th>文件夹中的素材</th><th>用途</th></tr></thead><tbody>${(plan?.mapping||[]).map(row=>`<tr><td><strong>${esc(row.local)}</strong></td><td>${esc(row.global)}</td><td>${row.role}</td></tr>`).join('')}</tbody></table></div>`;}
async function openDetail(id,jobMode=false){
  if(jobMode){try{const j=await api('/api/job?id='+encodeURIComponent(id));state.jobs=state.jobs.filter(x=>x.id!==id);state.jobs.push(j);}catch(error){toast(error.message);return;}}
  detail={id,jobMode};const job=jobMode?state.jobs.find(j=>j.id===id):null,task=jobMode?null:state.tasks.find(t=>t.id===id),item=job||task;
  if(!item){toast('记录不存在，请刷新');return;}
  const executing=task&&live.includes(task.status),last=job||task.latestJob;
  const plan=job?.plan||(executing?last?.plan:task?.plan),errors=job?[job.error].filter(Boolean):[...task.errors,...task.configErrors,task.latestJob?.error].filter(Boolean);
  $('#detail-title').textContent=`${job?.taskNumber||task.data.任务编号} · ${jobMode?'执行记录':'任务详情'}`;
  $('#detail-body').innerHTML=`<div class="detail-content"><div class="detail-meta">${esc(item.folder)}<br>${jobMode||executing?'执行模型':'新任务模型'}：${esc(job?.providerName||(executing?last?.providerName:task.providerName)||'待配置')} · ${statusBadge(item.status)} · 比例：${esc(plan?.ratio??'模型自适应')}</div>
  ${errors.length?`<div class="notice error">${esc([...new Set(errors)].join('\n'))}</div>`:''}
  ${last?.resultPath?`<div class="detail-section"><span class="section-label">结果已保存</span><div class="small-path">${esc(last.resultPath)}</div><a class="button small" href="${esc(viewerUrl(last,true))}">打开完整结果</a>${last.resultCount>1?`<p class="field-note">接口返回 ${last.resultCount} 张图片，按配置的输出索引保存一张。</p>`:''}</div>`:''}
  <div class="detail-section"><span class="section-label">${jobMode?'本次执行要求':'本次执行要求（可编辑，使用文件夹编号）'}</span>${jobMode?`<div class="prompt-box">${esc(plan?.effectivePrompt||'')}</div>`:`<textarea id="override-prompt" rows="5" aria-label="本次执行要求">${esc(task.override||task.data.具体要求||'')}</textarea><div class="field-note">只修改执行副本，不修改原始 JSON。</div>`}</div>
  <details class="advanced"><summary>图片编号映射 · 按实际发送顺序</summary>${mappingTable(plan)}</details>
  <details class="advanced"><summary>${jobMode?'实际发送提示词':'发送提示词预览'}</summary><div class="prompt-box">${esc(plan?.prompt||'请先修正任务内容')}</div></details>
  ${!jobMode?`<details class="advanced"><summary>JSON 中的原始要求</summary><div class="prompt-box">${esc(task.data.具体要求)}</div></details>`:''}
  ${last?.remoteId?`<details class="advanced"><summary>远程任务编号 · ${esc(last.providerName)}</summary><span class="mono">${esc(last.remoteId)}</span></details>`:''}
  <div class="detail-actions">${!jobMode?button('保存修改并更新预览','save-override',task.id):''}${last?.canResume&&['failed','uncertain'].includes(last.status)?button('继续查询 / 下载原任务','resume-job',last.id,'primary'):''}${!jobMode&&!live.includes(task.status)&&!(task.status==='failed'&&last?.canResume)?button(task.status==='completed'?'重新生成一张':task.status==='uncertain'?'核对后重新生成':'执行本任务','run-one',task.id,'primary'):''}${!jobMode&&task.status==='failed'&&last?.canResume?button('重新生成一张','rerun-one',task.id):''}${!jobMode?button('打开需求文件夹','open-folder',task.id):''}${!jobMode?button('打开 AI 文件夹','open-output',task.id):''}${button('刷新详情','refresh-detail')}</div></div>`;
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
}
async function start(ids,force=false){if(!ids.length)throw new Error('请先选择可执行任务');const result=await api('/api/start',{ids,force,modelChoice});await refresh();toast(`${isDemo?'模拟执行 · ':''}已加入 ${result.added} 条任务 · ${modelLabel()}${result.skipped.length?'\n'+result.skipped.join('\n'):''}`);if(detail&&!detail.jobMode&&$('#detail-dialog').open)openDetail(detail.id);}
function renderFolderList(){
  const list=$('#folder-list');if(!list)return;
  $('#folder-count').textContent='已添加 '+pendingFolders.length+' 个文件夹';
  list.hidden=!pendingFolders.length;
  list.innerHTML=pendingFolders.map((f,i)=>'<div class="folder-entry '+(f.error?'folder-invalid':'')+'"><div><strong>'+esc(f.name)+'</strong><div class="small-path" title="'+esc(f.path)+'">'+esc(f.path)+'</div>'+(f.error?'<div class="history-error">'+esc(f.error)+'</div>':'')+'</div>'+button('移除','remove-folder',String(i))+'</div>').join('');
  $('[data-action="cancel-picker"]').hidden=!pickerBusy;
  $('[data-action="clear-folders"]').disabled=!pendingFolders.length;
  $('[data-action="import"]').disabled=!pendingFolders.some(f=>!f.error);
}
function mergeFolders(result){
  const key=p=>p.replace(/[\\/]+$/,'').toLowerCase();const seen=new Set(pendingFolders.map(f=>key(f.path)));let added=0,duplicates=result.duplicates||0;
  for(const f of result.entries||[]){if(seen.has(key(f.path))){duplicates++;continue;}pendingFolders.push(f);seen.add(key(f.path));added++;}renderFolderList();
  toast('新增 '+added+' 个文件夹'+(duplicates?'，忽略 '+duplicates+' 个重复目录':'')+(result.skipped?'，跳过 '+result.skipped+' 个非目录或无效内容':'')+'。点击扫描并导入开始读取需求');
}
async function pasteFolders(){mergeFolders(await api('/api/clipboard-folders',{}));}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&e.target.closest('#folder-dropzone')){e.preventDefault();if(busy)return;busy=true;pasteFolders().catch(error=>toast(error.message)).finally(()=>busy=false);}});
document.addEventListener('dragover',e=>{if(e.target.closest('#folder-dropzone')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
document.addEventListener('drop',e=>{if(!e.target.closest('#folder-dropzone')){if(e.dataTransfer.files.length)e.preventDefault();return;}e.preventDefault();if(busy)return;const text=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');if(!text){toast('浏览器没有提供文件夹原路径。请在资源管理器复制这些文件夹，再到此处按 Ctrl+V，或点击选择文件夹。');return;}busy=true;api('/api/validate-folders',{paths:text}).then(result=>mergeFolders(result)).catch(error=>toast(error.message)).finally(()=>busy=false);});
async function importPaths(paths){
  selected.clear();taskPage=1;
  const result=await api('/api/import',{paths,recursive:$('#recursive')?.checked??true});await refresh();
  pendingFolders=[];renderFolderList();
  if($('#report'))$('#report').innerHTML=result.warnings.length?`<details class="import-warning"><summary>导入完成 · ${result.warnings.length} 条提示，点击查看</summary><div class="notice error">${result.warnings.map(esc).join('\n')}</div></details>`:'';
  toast(`导入完成：${result.added} 条新增任务`);
}
document.addEventListener('input',e=>{if(['search','category-filter','status-filter'].includes(e.target.id)){taskPage=1;updateTasks();}});
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
  const nav=e.target.closest('[data-page]');if(nav){if(busy){toast('请等待当前操作完成后再切换页面');return;}go(nav.dataset.page);return;}
  const control=e.target.closest('[data-action]');if(!control)return;if(control.dataset.action==='cancel-picker'){await api('/api/cancel-pick-folder',{}).catch(error=>toast(error.message));return;}if(busy)return;
  const {action,id}=control.dataset;
  try{
    busy=true;control.disabled=true;
    if(action==='reset-demo'){await api('/api/demo-reset',{});selected.clear();taskPage=1;modelChoice='auto';await refresh();go('tasks');toast('演示已重置');}
    if(action==='other-jobs'){go('history');$('#range-preset').value='all';$('#report-from').value='';$('#report-to').value='';historyStatus='live';await updateHistory();}
    if(action==='history-status'){historyStatus=id;historyPage=1;await updateHistory();}
    if(action==='history-prev'){historyPage--;await updateHistory();}
    if(action==='history-next'){historyPage++;await updateHistory();}
    if(action==='dashboard-refresh')await updateDashboard();
    if(action==='time-setting'){const value=await promptNumber('每张图片预计节约多少分钟？修改后全部统计按新值计算。',String(savedMinutes));if(value!==null){await api('/api/time-setting',{minutes:Number(value)});await updateDashboard();}}
    if(action==='prev-page'){taskPage=Math.max(1,taskPage-1);updateTasks();}
    if(action==='next-page'){taskPage++;updateTasks();}
    if(action==='refresh')await refresh();
    if(action==='pick'){pickerBusy=true;renderFolderList();try{const result=await api('/api/pick-folder',{initial:pendingFolders.at(-1)?.path||''});mergeFolders(result);}finally{pickerBusy=false;renderFolderList();}}
    if(action==='paste-folders')await pasteFolders();
    if(action==='clear-folders'){pendingFolders=[];renderFolderList();}
    if(action==='remove-folder'){pendingFolders.splice(Number(id),1);renderFolderList();}
    if(action==='toggle-key'){const input=$('#account-key');input.type=input.type==='password'?'text':'password';control.textContent=input.type==='password'?'显示':'隐藏';}
    if(action==='import'){const paths=pendingFolders.filter(f=>!f.error).map(f=>f.path);if(!paths.length)throw new Error('请先粘贴或选择有效的需求文件夹');await importPaths(paths);}
    if(action==='demo')await importPaths([state.examplePath]);
    if(action==='detail')await openDetail(id);
    if(action==='job')await openDetail(id,true);
    if(action==='refresh-detail'){await refresh();openDetail(detail.id,detail.jobMode);}
    if(action==='run-all')await start(batchTasks().filter(t=>t.status==='ready').map(t=>t.id));
    if(action==='run-selected'){const tasks=batchTasks().filter(t=>selected.has(t.id));if(tasks.some(t=>['completed','uncertain'].includes(t.status)))throw new Error('已完成或待核对任务请在详情中单独选择重新生成');await start(tasks.map(t=>t.id));}
    if(action==='rerun-one'){
      if(await confirmAction(isDemo?'模拟重新生成并保存演示版本，是否继续？':'将新增一次 RunningHub 生图任务并保存新版本，是否继续？'))await start([id],true);
    }
    if(action==='run-one'){
      const task=state.tasks.find(t=>t.id===id);let force=false;
      if(['completed','uncertain'].includes(task.status)){if(!await confirmAction(isDemo?'模拟重新生成一张演示结果，是否继续？':task.status==='uncertain'?'请确认已核对 RunningHub 记录。重新生成可能产生新的计费任务，是否继续？':'将新增一次生成并保存新版本，是否继续？'))return;force=true;}
      if(task.status==='failed'&&task.latestJob?.canResume){throw new Error('请先继续查询 / 下载原任务；需要新生成时可重新导入或修改执行要求。');}
      await start([id],force);
    }
    if(action==='toggle-queue'){await api('/api/pause',{paused:!state.paused});await refresh();}
    if(action==='resume-job'){await api('/api/resume-job',{id});await refresh();toast(isDemo?'已恢复模拟任务，未调用真实模型':'已恢复原任务，不重复提交生图');if(detail&&$('#detail-dialog').open)openDetail(detail.id,detail.jobMode);}
    if(action==='save-override'){await api('/api/override',{id,prompt:$('#override-prompt').value});await refresh();openDetail(id);toast('已保存执行要求并更新编号');}
    if(action==='open-folder'||action==='open-output'){await api('/api/open-folder',{id,output:action==='open-output'});toast(isDemo?'演示版目录仅作展示，请在本地版打开真实文件夹':'已请求 Windows 打开文件夹');}
    if(action==='remove'){if(!selected.size)throw new Error('请先选择任务');if(await confirmAction('只从工作台移除选中任务，磁盘上的需求和结果保留。继续？')){const r=await api('/api/batch-remove',{batchId:state.currentBatchId,ids:[...selected]});selected.clear();await refresh();toast(`移除 ${r.removed} 条任务，跳过 ${r.skipped} 条排队或执行中任务`);}}
    if(action==='remove-batch'){if(await confirmAction(`移除当前列表全部 ${batchTasks().length} 条任务？不受当前筛选或分页限制。保留磁盘文件和执行记录，排队及执行中任务跳过。`)){const r=await api('/api/batch-remove',{batchId:state.currentBatchId,all:true});selected.clear();await refresh();toast(`移除 ${r.removed} 条，跳过 ${r.skipped} 条`);}}
    if(action==='clear-key'){if(await confirmAction('清除本机已保存的 API Key？之后执行新任务需要重新配置。')){await api('/api/account',{clearKey:true});await refresh();renderSettings();toast('API Key 已清除');}}
    if(action==='save-settings'){await api('/api/account',collectSettings());await refresh();if(page==='settings')renderSettings();toast(state.hasKey?'共享 API Key 已保存':'共享 API Key 已清除');}
  }catch(error){toast(error.message);}finally{busy=false;if(control.isConnected)control.disabled=false;if(page==='tasks'){updateTasks();renderFolderList();}}
});
$('#close-detail').addEventListener('click',()=>{$('#detail-dialog').close();detail=null;});
$('#detail-dialog').addEventListener('click',e=>{if(e.target===$('#detail-dialog')){$('#detail-dialog').close();detail=null;}});
try{await refresh();go('tasks');}catch(e){$('#main').innerHTML=`<div class="notice error">连接本地服务失败：${esc(e.message)}。请启动工作台后刷新页面。</div>`;}
setInterval(async()=>{if(busy||!state)return;try{await refresh();}catch(error){$('#connection').textContent=error.message.includes('版本不一致')?error.message:'本地服务暂时断开，请检查启动状态';}},2500);

// Explicit image dimensions avoid percentage-height cycles in grid layout.
const preview=document.createElement('dialog');preview.id='local-preview';preview.setAttribute('aria-label','图片预览');preview.innerHTML='<div class="preview-tools"><button data-view="out" aria-label="缩小图片">−</button><button data-view="in" aria-label="放大图片">＋</button><button data-view="actual">原尺寸</button><button data-view="fit">适应窗口</button><span class="preview-zoom" aria-live="polite"></span><button data-view="close" aria-label="关闭图片预览">×</button></div><div class="preview-meta"></div><div class="preview-stage"><div class="preview-canvas"><img alt="图片预览" draggable="false"></div></div><p class="preview-error" role="status" hidden></p>';document.body.append(preview);
let previewScale=1,previewMode='fit',drag;
const previewImage=preview.querySelector('img'),previewStage=preview.querySelector('.preview-stage'),previewError=preview.querySelector('.preview-error');
function previewReady(ready){preview.querySelectorAll('[data-view]:not([data-view="close"])').forEach(b=>b.disabled=!ready);}
function scalePreview(value){
  if(!previewImage.naturalWidth||previewImage.hidden)return;
  previewMode=value===0?'fit':'manual';
  previewScale=value||Math.min(1,(previewStage.clientWidth-2)/previewImage.naturalWidth,(previewStage.clientHeight-2)/previewImage.naturalHeight);
  previewScale=Math.max(.001,Math.min(8,previewScale));
  previewImage.style.width=Math.max(1,Math.floor(previewImage.naturalWidth*previewScale))+'px';
  previewImage.style.height=Math.max(1,Math.floor(previewImage.naturalHeight*previewScale))+'px';
  preview.querySelector('.preview-zoom').textContent=Math.round(previewScale*100)+'%';
  previewStage.scrollTop=0;previewStage.scrollLeft=0;
}
document.addEventListener('click',e=>{
  const link=e.target.closest('a[href]');if(!link)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname!=='/viewer')return;e.preventDefault();
  const jobId=url.searchParams.get('job'),taskId=url.searchParams.get('task'),j=[...state.jobs,...historyJobs].find(j=>j.id===jobId),t=state.tasks.find(t=>t.id===taskId);
  preview.querySelector('.preview-meta').textContent=j?j.taskNumber+' · '+j.providerName+' · '+j.resultPath:(t?.data.任务编号||'')+' · '+(t?.folder||'');
  previewMode='fit';preview.querySelector('.preview-zoom').textContent='';previewReady(false);previewError.hidden=false;previewError.textContent='正在加载图片…';previewImage.hidden=true;
  previewImage.onload=()=>{previewImage.hidden=false;previewError.hidden=true;previewReady(true);scalePreview(0);};
  previewImage.onerror=()=>{previewImage.hidden=true;previewReady(false);previewError.hidden=false;previewError.textContent='图片不可访问，可能已移动、重命名或删除。请检查记录中的原路径与文件是否存在。';};
  if(!preview.open)preview.showModal();
  previewImage.src=jobId?'/api/result?job='+encodeURIComponent(jobId):'/api/image?task='+encodeURIComponent(taskId)+'&image='+encodeURIComponent(url.searchParams.get('image'));
});
preview.addEventListener('click',e=>{const action=e.target.closest('[data-view]')?.dataset.view;if(action==='close')preview.close();if(action==='fit')scalePreview(0);if(action==='actual')scalePreview(1);if(action==='in'||action==='out')scalePreview(Math.max(.001,Math.min(8,previewScale*(action==='in'?1.25:.8))));});
new ResizeObserver(()=>{if(preview.open&&previewMode==='fit')scalePreview(0);}).observe(previewStage);
preview.addEventListener('close',()=>{drag=null;});
previewStage.addEventListener('pointerdown',e=>{if(e.button!==0||previewImage.hidden)return;drag={x:e.clientX,y:e.clientY,left:previewStage.scrollLeft,top:previewStage.scrollTop};previewStage.setPointerCapture(e.pointerId);e.preventDefault();});
previewStage.addEventListener('pointermove',e=>{if(drag){previewStage.scrollLeft=drag.left+drag.x-e.clientX;previewStage.scrollTop=drag.top+drag.y-e.clientY;}});
previewStage.addEventListener('pointerup',()=>drag=null);previewStage.addEventListener('pointercancel',()=>drag=null);

let reportTimer;
document.addEventListener('input',e=>{if(e.target.id==='history-search'){clearTimeout(reportTimer);reportTimer=setTimeout(()=>{historyPage=1;updateHistory();},250);}});
document.addEventListener('change',e=>{if(e.target.id==='trend-grain'){reportGrain=e.target.value;updateDashboard().catch(error=>toast(error.message));}if(e.target.id==='range-preset'){const value=e.target.value,today=dateToday();if(value==='all'){$('#report-from').value='';$('#report-to').value='';}else if(value!=='custom'){const start=new Date(today+'T12:00:00+08:00');if(value==='month')$('#report-from').value=today.slice(0,7)+'-01';else{start.setUTCDate(start.getUTCDate()-(value==='week'?6:value==='30'?29:0));$('#report-from').value=start.toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});}$('#report-to').value=today;}}if(['range-preset','report-from','report-to','history-model','history-batch','history-category'].includes(e.target.id)){if(e.target.id.startsWith('report-'))$('#range-preset').value='custom';if(page==='history'){historyPage=1;updateHistory();}else if(page==='dashboard')updateDashboard().catch(error=>toast(error.message));}});
