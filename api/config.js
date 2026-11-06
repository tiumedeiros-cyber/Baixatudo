// Only publishable configuration may leave this endpoint. Never expose service-role/secret keys.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({error:'Método não permitido.'}));}
 if(process.env.BAIXATUDO_AUTH_ENABLED!=='true')return res.end(JSON.stringify({enabled:false,reason:'O cadastro e o armazenamento em conta aguardam ativação do Supabase. Este é o modo local, não multiusuário.'}));
 const url=process.env.SUPABASE_URL||'';const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
 const safeKey=key.startsWith('sb_publishable_')||(()=>{try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{return false;}})();
 let safeUrl=false;try{const parsed=new URL(url);safeUrl=parsed.protocol==='https:'&&parsed.hostname.endsWith('.supabase.co')&&!parsed.username&&!parsed.password&&!parsed.port;}catch{}
 if(!safeUrl||!safeKey){res.statusCode=503;return res.end(JSON.stringify({error:'Configuração de autenticação incompleta ou inválida. Nenhum segredo foi exposto.'}));}
 res.end(JSON.stringify({enabled:true,url,key}));
}
