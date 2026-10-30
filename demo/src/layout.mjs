const info=document.querySelector('.demo-info');
const narrow=window.matchMedia('(max-width:720px)');
function syncMenu(){info.open=!narrow.matches;}
syncMenu();
narrow.addEventListener('change',syncMenu);
info.addEventListener('toggle',()=>{if(!narrow.matches&&!info.open)info.open=true;});
document.addEventListener('click',event=>{
  if(narrow.matches&&(!info.contains(event.target)||event.target.closest('[data-action="reset-demo"]')))info.open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&narrow.matches&&info.open){info.open=false;info.querySelector('summary').focus();}
});
