// JWT validity and entitlements are checked by Supabase/PostgREST, not decoded/trusted in Node.
export async function authorizePlatformRequest(req,action,{fetcher=fetch,env=process.env}={}) {
 if(env.BAIXATUDO_AUTH_ENABLED!=='true')return;
 const denied=(status,message)=>Object.assign(Error(message),{status});
 const token=req.headers.authorization||'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(token)||token.length>16000)throw denied(401,'Entre na sua conta para usar este recurso.');
 let url;try{url=new URL(env.SUPABASE_URL);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.port)throw Error();}catch{throw denied(503,'Configuração de acesso indisponível.');}
 const key=env.SUPABASE_PUBLISHABLE_KEY||'';
 const publicKey=key.startsWith('sb_publishable_')||(()=>{try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{return false;}})();
 if(!publicKey)throw denied(503,'Configuração de acesso indisponível.');
 let response,data;
 try{response=await fetcher(new URL('/rest/v1/rpc/baixatudo_reserve_request',url),{method:'POST',headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({p_action:action}),signal:AbortSignal.timeout(8000)});data=await response.json();}catch{throw denied(503,'Não foi possível verificar sua permissão. Nenhum provedor foi chamado.');}
 if(!response.ok)throw denied([401,403].includes(response.status)?401:503,'Não foi possível autorizar esta sessão. Entre novamente ou tente depois.');
 if(data?.allowed===true)return;
 if(data?.reason==='quota')throw denied(429,'Limite de solicitações atingido. O administrador pode ajustar sua cota.');
 if(data?.reason==='disabled')throw denied(403,'Este recurso está desativado pelo administrador.');
 if(data?.reason==='blocked')throw denied(403,'O acesso desta conta às APIs está bloqueado pelo administrador.');
 throw denied(503,'A permissão não pôde ser confirmada.');
}
