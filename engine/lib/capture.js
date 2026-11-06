import {lookup} from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import {load} from 'cheerio';
export function isPublicAddress(value){try{let ip=ipaddr.parse(value);if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();return ip.range()==='unicast';}catch{return false;}}
export function parseTarget(value){
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('Use um endereço público http ou https, sem credenciais ou portas alternativas.');
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(!host||host==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(host)||host.includes('%'))throw Error('Endereços locais não são permitidos.');
 if(ipaddr.isValid(host)&&!isPublicAddress(host))throw Error('Endereços privados ou reservados não são permitidos.');
 url.hash='';return url;
}
export async function requestPage(value,{resolver=lookup,maxBytes=1024*1024,deadline=Date.now()+15000}={}){
 let url=parseTarget(value);
 for(let count=0;count<4;count++){
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const records=ipaddr.isValid(hostname)?[{address:hostname,family:ipaddr.parse(hostname).kind()==='ipv6'?6:4}]:await Promise.race([resolver(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Tempo de DNS excedido.')),3000);timer.unref?.();})]);
  if(!records.length||records.some(r=>!isPublicAddress(r.address)))throw Error('O domínio aponta para um endereço privado ou reservado.');
  if(Date.now()>deadline)throw Error('Tempo de captura excedido.');
  const record=records[0];
  const result=await new Promise((resolve,reject)=>{
   const request=(url.protocol==='https:'?https:http).get(url,{headers:{'User-Agent':'BaixatudoPersonal/0.2 (public-page text capture)','Accept':'text/html','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>options.all?cb(null,[record]):cb(null,record.address,record.family)},response=>{
    const status=response.statusCode||0;
    if([301,302,303,307,308].includes(status)){response.resume();resolve({redirect:response.headers.location});return;}
    if(status!==200){response.resume();reject(Error(`O site respondeu ${status}. Não contornamos bloqueios ou login.`));return;}
    if(!String(response.headers['content-type']).includes('text/html')){response.resume();reject(Error('A referência precisa ser uma página HTML.'));return;}
    if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();reject(Error('O site usa compactação não suportada para captura simples.'));return;}
    const chunks=[];let bytes=0;
    response.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy();reject(Error('Página muito grande para a captura simples (máximo 1 MB).'));}else chunks.push(chunk);});
    response.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));response.on('error',reject);
   });
   const timeout=setTimeout(()=>request.destroy(Error('Tempo de captura excedido.')),Math.max(1,deadline-Date.now()));timeout.unref?.();
   request.on('close',()=>clearTimeout(timeout));request.on('error',reject);
  });
  if(result.redirect){url=parseTarget(new URL(result.redirect,url).href);continue;}
  if(!result.html)throw Error('Redirecionamento sem destino ou página vazia.');
  return {url:url.href,html:result.html};
 }
 throw Error('Muitos redirecionamentos.');
}
export function extractEvidence(html,url){
 const $=load(html);const title=$('title').first().text().trim().slice(0,300);
 $('script,style,noscript,iframe,form,input,textarea,select,[contenteditable],[hidden],[aria-hidden="true"]').remove();
 const headings=$('h1,h2,h3').map((_,el)=>$(el).text().trim().slice(0,160)).get().slice(0,30);
 const text=$('body').text().replace(/\s+/g,' ').trim().slice(0,16000);
 return {kind:'baixatudo-evidence',version:1,page:{title,url,text,capturedAt:new Date().toISOString()},headings,limitations:['Captura de HTML público, sem executar JavaScript.','Não comprova comportamento, aparência renderizada ou regras de backend.','A página pode estar incompleta; use a extensão para conteúdo renderizado autorizado.']};
}
