const KEY='baixatudo-ai-profile-v1';
export const OPTIONS=[{id:'manual',name:'Validação sem API · copiar e importar',model:''},{id:'local',name:'IA no aparelho · WebLLM',model:''},{id:'openrouter',name:'OpenRouter · modelos gratuitos',model:'openrouter/free'},{id:'gemini',name:'Google Gemini · cota da sua conta',model:''},{id:'openai',name:'OpenAI / GPT · API da sua conta',model:''},{id:'groq',name:'Groq · cota da sua conta',model:''}];
export function normalizeProfile(raw={}){const provider=OPTIONS.some(p=>p.id===raw.provider)?raw.provider:'manual';return {provider,model:typeof raw.model==='string'?raw.model.slice(0,160):OPTIONS.find(x=>x.id===provider).model,freeOnly:raw.freeOnly!==false,allowMetered:raw.allowMetered===true};}
let initial;try{initial=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{initial={};}
export let profile=normalizeProfile(initial);
// Credential only in this module's memory; not localStorage, sessionStorage, URL or backups.
let credential='';
export function configure(raw,key=''){credential='';const next=normalizeProfile(raw);localStorage.setItem(KEY,JSON.stringify(next));profile=next;credential=String(key).trim();return profile;}
export function forgetKey(){credential='';}
export function hasKey(){return Boolean(credential);}
export async function generateRemote(messages,{signal}={}){if(!credential)throw Error('Informe sua chave no painel. Ela não é guardada e precisa ser reinserida ao reabrir a página.');const response=await fetch('/api/infer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...profile,apiKey:credential,messages,maxTokens:6000}),signal});let data;try{data=await response.json();}catch{throw Error('O servidor não conseguiu responder. Seu projeto foi preservado.');}if(!response.ok)throw Error(data.error||'Falha na conexão com o provedor.');return data.text;}
