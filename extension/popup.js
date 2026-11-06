const $=id=>document.getElementById(id);
let page,tabs=[];
function cleanUrl(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use uma URL http ou https, sem credenciais.');url.search='';url.hash='';return url.href;}
function showSource(){for(const name of ['tab','url','file'])$(name+'-fields').hidden=$('source').value!==name;page=null;$('review').hidden=true;}
async function listTabs(){
 try{tabs=(await chrome.tabs.query({currentWindow:true})).filter(tab=>Number.isInteger(tab.id)&&/^https?:\/\//.test(tab.url||''));const select=$('target-tab');select.replaceChildren();for(const tab of tabs){const option=document.createElement('option');option.value=String(tab.id);option.textContent=(tab.title||'Site')+' · '+new URL(tab.url).hostname;select.append(option);}if(!tabs.length){const option=document.createElement('option');option.textContent='Nenhuma aba de site encontrada';option.value='';select.append(option);$('status').textContent='Abra o site em outra aba ou escolha Um endereço / Um arquivo.';}}
 catch{$('status').textContent='Não foi possível listar abas neste navegador. Use a opção de endereço ou arquivo.';}
}
function grant(url){return chrome.permissions.request({origins:[new URL(url).origin+'/*']});}
function fromHTML(html){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,noscript,iframe,form,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"]').forEach(el=>el.remove());return {title:doc.title.slice(0,300),text:doc.body.textContent.replace(/\s+/g,' ').trim().slice(0,100000)};}
async function readPublic(url){const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html'}});if(!response.ok)throw Error('O site recusou a leitura (HTTP '+response.status+'). Use uma aba aberta, sem contornar bloqueios.');if(!String(response.headers.get('content-type')).includes('text/html'))throw Error('O endereço precisa retornar HTML.');let bytes=0;const decoder=new TextDecoder();let html='';for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1024*1024)throw Error('Página maior que 1 MB. Use uma aba aberta.');html+=decoder.decode(chunk,{stream:true});}html+=decoder.decode();return fromHTML(html);}
$('source').onchange=showSource;$('refresh').onclick=listTabs;
$('capture').onclick=async()=>{
 if(!$('consent').checked){$('status').textContent='Confirme a autorização antes de ler.';return;}
 const mode=$('source').value;
 // Initiate optional permission while still in the click's user gesture.
 let target,permission;
 try{if(mode==='tab'){target=tabs.find(tab=>tab.id===Number($('target-tab').value));if(!target)throw Error('Selecione uma aba de site, não a aba interna da extensão.');permission=grant(target.url);}else if(mode==='url'){target=$('target-url').value.trim();cleanUrl(target);permission=grant(target);}}
 catch(err){$('status').textContent=err.message;return;}
 $('capture').disabled=true;page=null;$('review').hidden=true;
 try{
  if(permission&&!await permission)throw Error('Permissão para este site não concedida. Você pode usar arquivo local.');
  if(mode==='tab'){
   const current=await chrome.tabs.get(target.id);if(new URL(current.url).origin!==new URL(target.url).origin)throw Error('A aba mudou de site. Atualize a lista e selecione novamente.');
   const result=await chrome.scripting.executeScript({target:{tabId:target.id},func:()=>{
    const url=new URL(location.href);url.search='';url.hash='';url.username='';url.password='';
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const chunks=[];let length=0,node;
    while((node=walker.nextNode())&&length<100000){const parent=node.parentElement;if(!parent||parent.closest('input,textarea,select,script,style,[contenteditable],noscript,[hidden],[aria-hidden="true"]'))continue;const style=getComputedStyle(parent);if(style.display==='none'||style.visibility!=='visible'||!parent.getClientRects().length)continue;const value=node.textContent.trim();if(value){chunks.push(value);length+=value.length+1;}}
    return {title:document.title.slice(0,300),url:url.href,text:chunks.join('\n').slice(0,100000),capturedAt:new Date().toISOString()};
   }});page=result[0]?.result;
  }else if(mode==='url'){page={...await readPublic(target),url:cleanUrl(target),capturedAt:new Date().toISOString()};}
  else{const file=$('target-file').files[0];if(!file)throw Error('Selecione um arquivo.');if(file.size>500000||! /\.(html?|txt|json|md|js|css)$/i.test(file.name))throw Error('Use arquivo textual de até 500 KB, não ZIP, EXE ou APK.');const content=await file.text();if(/\.json$/i.test(file.name)){try{const raw=JSON.parse(content);if(raw.kind==='baixatudo-evidence'&&raw.version===1&&raw.page&&typeof raw.page.text==='string')page={title:String(raw.page.title||file.name).slice(0,300),text:raw.page.text.slice(0,100000),url:raw.page.url?cleanUrl(raw.page.url):'',capturedAt:new Date().toISOString()};}catch{}}
   page??={title:'Arquivo: '+file.name.slice(0,280),url:'',text:content.slice(0,100000),capturedAt:new Date().toISOString()};
  }
  if(!page||typeof page.text!=='string'||!page.text.trim())throw Error('A referência não retornou texto utilizável.');
  $('title').value=page.title;$('text').value=page.text;$('review').hidden=false;$('status').textContent='Referência preparada. Revise e salve para importar no Studio.';
 }catch(err){$('status').textContent='Não foi possível preparar: '+(err.message||'Falha de permissão ou rede.');}finally{$('capture').disabled=false;}
};
$('save').onclick=()=>{if(!page)return;const data={kind:'baixatudo-evidence',version:1,page:{...page,title:$('title').value,text:$('text').value}};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='baixatudo-captura.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);$('status').textContent='Importe o arquivo em Projeto → Referências no Studio.';};
$('save-open').onclick=()=>{if(!page)return;$('save').click();window.open('https://baixatudo-studio.vercel.app/#import','_blank','noopener,noreferrer');$('status').textContent='No Studio, selecione o arquivo baixado para criar o projeto. O JSON não é o clone pronto.';};
showSource();listTabs();
