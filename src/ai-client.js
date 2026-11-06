import * as providers from './providers.js';
import {MODELS,makeMessages,parseGeneration} from './ai-core.js';
let engine=null,worker=null,modelId=null,busy=false;
let instructions,remoteAbort;
export const getProfile=()=>providers.profile;
export const keyPresent=()=>providers.hasKey();
export function configure(raw,key){cancel();const p=providers.configure(raw,key);runtime.state=p.provider==='manual'?'manual':p.provider==='local'?'idle':providers.hasKey()?'ready':'idle';runtime.message=p.provider==='manual'?'Validação sem API: prepare o pedido e importe a resposta da IA.':p.provider==='local'?'Ative o modelo no aparelho abaixo.':providers.hasKey()?'Provedor selecionado. Conexão ainda não testada; chave apenas nesta aba.':'Configuração salva. Falta informar a chave nesta aba.';emit();}
export async function messagesFor(task,project,request){instructions??=await fetch('/public/engine-instructions.json').then(r=>{if(!r.ok)throw Error('Instruções internas indisponíveis.');return r.json();});return makeMessages({task,project,request,instructions});}
export async function generateWithProvider(task,project,request){if(providers.profile.provider==='manual')throw Error('Use Preparar pedido e Importar resposta.');if(providers.profile.provider==='local')return generate(task,project,request);if(busy)throw Error('Aguarde a geração atual.');busy=true;runtime.state='generating';runtime.message='Enviando pedido ao provedor escolhido. Não há fallback pago automático.';emit();const controller=new AbortController();remoteAbort=controller;try{const messages=await messagesFor(task,project,request);const text=await providers.generateRemote(messages,{signal:controller.signal});if(controller.signal.aborted)throw Error('Pedido cancelado.');return parseGeneration(text);}finally{if(remoteAbort===controller){remoteAbort=null;busy=false;runtime.state=providers.hasKey()?'ready':'idle';runtime.message='Pedido encerrado. Revise o resultado; a IA não executou testes.';emit();}}}
export function forgetKey(){providers.forgetKey();cancel();}
export const runtime={state:providers.profile.provider==='manual'?'manual':'idle',progress:0,message:'Escolha a validação sem API ou configure sua IA em Administração.',model:null};
function emit(){window.dispatchEvent(new CustomEvent('studio-ai',{detail:{...runtime}}));}
export async function support(){
 if(!navigator.gpu)return {ok:false,message:'Este navegador não disponibiliza WebGPU. Tente uma versão atual do Chrome/Edge em um aparelho compatível. Modo computador não adiciona WebGPU.'};
 try{const adapter=await navigator.gpu.requestAdapter();return adapter?{ok:true,message:'GPU detectada. O carregamento ainda pode falhar por memória ou limites do aparelho.'}:{ok:false,message:'Nenhuma GPU compatível foi encontrada neste navegador.'};}catch{return {ok:false,message:'Não foi possível acessar a GPU neste aparelho.'};}
}
export async function activate(id){
 if(busy)throw Error('Aguarde a operação atual.');if(engine&&modelId===id)return;
 if(!MODELS.some(x=>x.id===id))throw Error('Modelo não permitido.');
 const check=await support();if(!check.ok)throw Error(check.message);providers.configure({provider:'local',model:''});
 busy=true;runtime.state='loading';runtime.message='Preparando download do modelo. Mantenha esta aba aberta.';runtime.progress=0;emit();
 try{
  await deactivate(false);
  const webllm=await import('/vendor/webllm.js');
  worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
  engine=await webllm.CreateWebWorkerMLCEngine(worker,id,{initProgressCallback:r=>{runtime.progress=Math.max(0,Math.min(1,r.progress||0));runtime.message=r.text||'Carregando modelo…';emit();}},{context_window_size:8192});
  modelId=id;runtime.model=id;runtime.state='ready';runtime.message='IA pronta neste aparelho. Resultados precisam de revisão.';runtime.progress=1;emit();
 }catch(err){await deactivate(false);runtime.state='error';runtime.message='Não foi possível carregar a IA: '+err.message;emit();throw Error(runtime.message);}finally{busy=false;}
}
export async function deactivate(notify=true){worker?.terminate();worker=null;engine=null;modelId=null;runtime.model=null;if(notify){runtime.state='idle';runtime.message='IA desativada. Os pesos podem continuar no cache do navegador.';emit();}}
export function cancel(){remoteAbort?.abort();remoteAbort=null;worker?.terminate();worker=null;engine=null;modelId=null;busy=false;runtime.state='idle';runtime.model=null;runtime.message='Operação cancelada. Seu projeto anterior foi mantido.';emit();}
export async function generate(task,project,request){
 if(!engine||runtime.state!=='ready')throw Error('Ative a IA em Administração antes de gerar.');if(busy)throw Error('Já existe uma geração em andamento.');
 busy=true;runtime.state='generating';runtime.message='Criando rascunho neste aparelho. Não feche a aba.';emit();const active=engine;
 try{
  instructions??=await fetch('/public/engine-instructions.json').then(r=>{if(!r.ok)throw Error('Instruções internas indisponíveis.');return r.json();});
  const messages=makeMessages({task,project,request,instructions});
  const reply=await active.chat.completions.create({messages,temperature:0.3,max_tokens:2200,response_format:{type:'json_object'}});
  if(engine!==active)throw Error('Geração cancelada.');
  return parseGeneration(reply.choices[0]?.message?.content);
 }finally{busy=false;if(engine===active){runtime.state='ready';runtime.message='IA pronta neste aparelho.';emit();}}
}

window.addEventListener('pagehide',()=>{providers.forgetKey();cancel();});
