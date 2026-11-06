// Independent static HTML inspector. The runtime remains in an opaque-origin sandbox.
const allowed=new Set(['H1','H2','H3','H4','H5','H6','P','SPAN','DIV','MAIN','SECTION','ARTICLE','HEADER','FOOTER','NAV','BUTTON','A','LI','UL','OL','IMG','LABEL','STRONG','EM','SMALL']);
export function inspectorDocument(html,token){
 const script=`(()=>{const token=${JSON.stringify(token)};document.addEventListener('click',event=>{const el=event.target;if(!(el instanceof Element)||!${JSON.stringify([...allowed])}.includes(el.tagName))return;event.preventDefault();event.stopImmediatePropagation();const path=[];let node=el;while(node&&node!==document.body){if(!node.parentElement)return;path.unshift(Array.from(node.parentElement.children).indexOf(node));node=node.parentElement;}if(path.length>12)return;parent.postMessage({kind:'baixatudo-pick',token,path,tag:el.tagName,text:el.textContent.slice(0,2000),leaf:el.children.length===0},'*');},true);})();`;
 return html+'<script>'+script+'<\/script>';
}
export function patchElement(html,selection,{text,color,background,fontSize,action='style'}={}){
 const template=document.createElement('template');template.innerHTML=html;
 let node=template.content;
 if(!Array.isArray(selection.path)||!selection.path.length||selection.path.length>12)throw Error('Selecione um elemento estático na prévia.');
 for(const index of selection.path){if(!Number.isInteger(index)||index<0||index>2000)throw Error('Seleção inválida.');node=node.children?.[index];if(!node)throw Error('Elemento dinâmico: edite seu código JavaScript.');}
 if(!allowed.has(node.tagName)||node.tagName!==selection.tag||node.textContent.slice(0,2000)!==selection.text)throw Error('A prévia mudou ou o elemento é dinâmico. Selecione novamente ou edite o código.');
 if(action==='remove')node.remove();
 else if(action==='up'){const previous=node.previousElementSibling;if(previous)node.parentNode.insertBefore(node,previous);}
 else if(action==='down'){const next=node.nextElementSibling;if(next)node.parentNode.insertBefore(next,node);}
 else{
  if(text!==undefined){if(node.children.length)throw Error('Para preservar os elementos filhos, selecione um texto simples.');node.textContent=String(text).slice(0,2000);}
  for(const [key,value] of [['color',color],['backgroundColor',background]])if(value){if(!/^#[a-f0-9]{6}$/i.test(value))throw Error('Cor inválida.');node.style[key]=value;}
  if(fontSize!==undefined){const size=Number(fontSize);if(!Number.isFinite(size)||size<8||size>160)throw Error('Use tamanho de fonte de 8 a 160 px.');node.style.fontSize=size+'px';}
 }
 return template.innerHTML;
}
