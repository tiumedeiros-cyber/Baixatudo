import {authorizePlatformRequest} from '../engine/lib/platform-access.js';
import {readJson} from '../engine/lib/json-body.js';
import {requestPage,extractEvidence} from '../engine/lib/capture.js';
const limits=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'Método não permitido.'});}
 const host=req.headers.host;
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==host)return reply(403,{error:'Origem não autorizada.'});}catch{return reply(403,{error:'Origem inválida.'});}}
 if(!String(req.headers['content-type']).startsWith('application/json'))return reply(415,{error:'Envie JSON.'});
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const now=Date.now();
 for(const [key,item] of limits)if(now-item.start>60000)limits.delete(key);
 const limit=limits.get(ip)||{start:now,count:0};if(limit.count>=5)return reply(429,{error:'Limite de 5 capturas por minuto. Tente depois.'});limit.count++;limits.set(ip,limit);
 try{
  const body=await readJson(req,4096);
  if(!body||typeof body.url!=='string'||body.url.length>2000||body.authorized!==true)return reply(400,{error:'Informe uma URL e autorize a captura.'});
  await authorizePlatformRequest(req,'capture');
  const {url,html}=await requestPage(body.url);reply(200,extractEvidence(html,url));
 }catch(err){reply([401,403,413,429,503].includes(err.status)?err.status:400,{error:err instanceof SyntaxError?'JSON inválido.':err.message||'Não foi possível capturar esta referência.'});}
}
