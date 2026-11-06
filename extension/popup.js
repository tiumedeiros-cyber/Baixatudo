const $=id=>document.getElementById(id);
let page;
$('capture').onclick=async()=>{
 if(!$('consent').checked){$('status').textContent='Confirme a autorização antes de capturar.';return;}
 $('capture').disabled=true;
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('Abra uma página http ou https. Páginas internas do navegador não podem ser capturadas.');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const url=new URL(location.href);url.search='';url.hash='';url.username='';url.password='';
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   const chunks=[];let length=0,node;
   while((node=walker.nextNode())&&length<100000){
    const parent=node.parentElement;
    if(!parent||parent.closest('input,textarea,select,script,style,[contenteditable],noscript,[hidden],[aria-hidden="true"]'))continue;
    const style=getComputedStyle(parent);
    if(style.display==='none'||style.visibility!=='visible'||!parent.getClientRects().length)continue;
    const value=node.textContent.trim();if(!value)continue;
    chunks.push(value);length+=value.length+1;
   }
   const text=chunks.join('\n').slice(0,100000);
   return {title:document.title.slice(0,300),url:url.href,text,capturedAt:new Date().toISOString()};
  }});
  page=result[0]?.result;if(!page)throw Error('A captura não retornou conteúdo.');
  $('title').value=page.title;$('text').value=page.text;$('review').hidden=false;$('status').textContent='Captura local pronta. Revise antes de salvar.';
 }catch(err){$('status').textContent='Não foi possível capturar: '+err.message;}finally{$('capture').disabled=false;}
};
$('save').onclick=()=>{if(!page)return;const data={kind:'baixatudo-evidence',version:1,page:{...page,title:$('title').value,text:$('text').value}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='baixatudo-captura.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);$('status').textContent='Arquivo preparado. Importe-o em Referências no Studio.';};
