import {infer,validateInference} from '../engine/lib/providers.js';
const hits=new Map();
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 const reply=(code,data)=>{res.statusCode=code;res.end(JSON.stringify(data));};
 if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'Método não permitido.'});}
 try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'Origem não autorizada.'});}catch{return reply(403,{error:'Origem inválida.'});}
 if(!String(req.headers['content-type']).startsWith('application/json'))return reply(415,{error:'Envie JSON.'});
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],now=Date.now();for(const [key,value]of hits)if(now-value.start>60000)hits.delete(key);
 const rate=hits.get(ip)||{start:now,count:0};if(rate.count++>=10)return reply(429,{error:'Aguarde um minuto antes de tentar novamente.'});hits.set(ip,rate);
 let body;
 try{body=req.body;if(body===undefined){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65000)return reply(413,{error:'Pedido muito grande.'});}body=JSON.parse(text);}if(typeof body==='string')body=JSON.parse(body);body=validateInference(body);}catch(err){return reply(400,{error:err instanceof SyntaxError?'JSON inválido.':String(err.message).slice(0,200)});}
 try{reply(200,await infer(body));}catch(err){reply(err.status===429?429:502,{error:err.status?err.message:'Não foi possível concluir a conexão ou interpretar a resposta do provedor. Sua chave não foi salva; seu projeto foi mantido.'});}
}
