import {MODELS,makeMessages,parseGeneration} from './ai-core.js';
let engine=null,worker=null,modelId=null,busy=false;
let instructions;
export const runtime={state:'idle',progress:0,message:'Ative a IA neste aparelho para gerar projetos sem conta.',model:null};
function emit(){window.dispatchEvent(new CustomEvent('studio-ai',{detail:{...runtime}}));}
export async function support(){
 if(!navigator.gpu)return {ok:false,message:'Este navegador não disponibiliza WebGPU. Tente uma versão atual do Chrome/Edge em um aparelho compatível. Modo computador não adiciona WebGPU.'};
 try{const adapter=await navigator.gpu.requestAdapter();return adapter?{ok:true,message:'GPU detectada. O carregamento ainda pode falhar por memória ou limites do aparelho.'}:{ok:false,message:'Nenhuma GPU compatível foi encontrada neste navegador.'};}catch{return {ok:false,message:'Não foi possível acessar a GPU neste aparelho.'};}
}
export async function activate(id){
 if(busy)throw Error('Aguarde a operação atual.');if(engine&&modelId===id)return;
 if(!MODELS.some(x=>x.id===id))throw Error('Modelo não permitido.');
 const check=await support();if(!check.ok)throw Error(check.message);
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
export function cancel(){worker?.terminate();worker=null;engine=null;modelId=null;busy=false;runtime.state='idle';runtime.model=null;runtime.message='Operação cancelada. Seu projeto anterior foi mantido.';emit();}
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
