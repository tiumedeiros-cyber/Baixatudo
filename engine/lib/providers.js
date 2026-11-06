// Fixed upstreams only. Caller supplies its own key per request; never use a shared environment key.
export const PROVIDERS={
 openrouter:{name:'OpenRouter',endpoint:'https://openrouter.ai/api/v1/chat/completions'},
 openai:{name:'OpenAI',endpoint:'https://api.openai.com/v1/chat/completions'},
 groq:{name:'Groq',endpoint:'https://api.groq.com/openai/v1/chat/completions'},
 gemini:{name:'Gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta/models/'}
};
export function validateInference(body){
 if(!body||!Object.hasOwn(PROVIDERS,body.provider))throw Error('Provedor não permitido.');
 if(typeof body.apiKey!=='string'||body.apiKey.length<8||body.apiKey.length>512||/[\r\n]/.test(body.apiKey))throw Error('Informe a chave somente no campo seguro do painel.');
 if(typeof body.model!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:/._-]{0,159}$/.test(body.model))throw Error('Informe um identificador de modelo válido.');
 if(body.provider==='openrouter'&&body.freeOnly!==false){if(body.model!=='openrouter/free'&&!body.model.endsWith(':free'))throw Error('Modo gratuito: apenas openrouter/free ou um modelo :free.');}
 else if(body.allowMetered!==true)throw Error('É necessário reconhecer que a cota e o faturamento dependem da sua conta. Não ativamos cobrança por você.');
 if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>8||body.messages.some(m=>!m||!['user','assistant','system'].includes(m.role)||typeof m.content!=='string')||JSON.stringify(body.messages).length>50000)throw Error('Pedido inválido ou muito grande.');
 return {...body,maxTokens:Math.min(8192,Math.max(256,Number(body.maxTokens)||4096))};
}
export function upstreamRequest(raw){
 const body=validateInference(raw);const provider=PROVIDERS[body.provider];
 if(body.provider==='gemini')return {url:provider.endpoint+encodeURIComponent(body.model)+':generateContent',headers:{'Content-Type':'application/json','x-goog-api-key':body.apiKey},body:{systemInstruction:{parts:[{text:body.messages.filter(x=>x.role==='system').map(x=>x.content).join('\n')}]},contents:body.messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]})),generationConfig:{maxOutputTokens:body.maxTokens,responseMimeType:'application/json'}}};
 return {url:provider.endpoint,headers:{'Content-Type':'application/json','Authorization':'Bearer '+body.apiKey},body:{model:body.model,messages:body.messages,max_tokens:body.maxTokens,...(body.provider==='openrouter'?{provider:{allow_fallbacks:false}}:{})}};
}
export async function infer(body,{fetcher=fetch,signal}={}){
 const request=upstreamRequest(body);
 const response=await fetcher(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),redirect:'error',signal:signal||AbortSignal.timeout(90000)});
 if(!response.ok){const err=Error(response.status===401||response.status===403?'Chave recusada ou acesso indisponível. Verifique sua conta no provedor.':response.status===429?'Cota gratuita ou limite de uso atingido. Não trocamos para modelo pago.':`O provedor não concluiu o pedido (HTTP ${response.status}). Confirme o modelo e sua disponibilidade.`);err.status=response.status;response.body?.cancel?.();throw err;}
 // Bounded reader: do not trust an upstream or intermediary to return a small payload.
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('Resposta do provedor muito grande.');chunks.push(Buffer.from(chunk));}
 let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('O provedor não retornou JSON válido.');}
 const text=body.provider==='gemini'?data.candidates?.[0]?.content?.parts?.filter(x=>typeof x.text==='string'&&!x.thought).map(x=>x.text).join('\n'):data.choices?.[0]?.message?.content;
 if(typeof text!=='string'||!text.trim())throw Error('O provedor não devolveu conteúdo. Pode haver limite, filtro ou configuração incompatível.');
 // No upstream headers, credentials, raw errors or request payload in the response.
 return {text:text.slice(0,200000)};
}
