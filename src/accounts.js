export const account={status:'loading',enabled:false,user:null,owner:null,sync:'',error:'',reason:'',recovering:false};
let client,revision=0,pending=null,draining=null,epoch=0;
const blank=()=>({version:1,projects:[],settings:{name:'Meu espaço',autosave:true}});
function emit(type='account-change',detail={}){window.dispatchEvent(new CustomEvent(type,{detail:{...account,...detail}}));}
function safeError(error){if(['email_address_not_authorized','email_provider_disabled'].includes(error?.code)||/sending confirmation email/i.test(error?.message||''))return 'O envio de confirmação de e-mail precisa ser configurado ou autorizado no servidor. Seu e-mail não foi confirmado automaticamente.';return error?.code==='23505'?'Há outra sessão gravando este espaço. Faça backup e recarregue.':error?.message?.includes('Invalid login')?'E-mail ou senha inválidos.':error?.message?.includes('Email not confirmed')?'Confirme seu e-mail antes de entrar.':error?.message?.includes('rate limit')?'Limite temporário atingido. Aguarde antes de tentar novamente.':'Não foi possível concluir com o serviço de contas. Verifique sua conexão e a configuração do banco.';}
async function switchSession(session){
 const user=session?.user||null;if(user&&account.owner===user.id&&account.status==='ready')return;
 const generation=++epoch;pending=null;draining=null;revision=0;account.user=user;account.owner=user?.id||null;account.error='';account.status=user?'loading':'signed-out';account.sync='';emit('account-reset');
 if(!user){emit();return;}
 try{const {data,error}=await client.from('baixatudo_workspaces').select('payload,revision').eq('user_id',user.id).maybeSingle();if(generation!==epoch)return;if(error)throw error;revision=data?.revision||0;account.status='ready';account.sync='Salvo na conta';emit('account-workspace',{workspace:data?.payload||blank()});emit();}
 catch(error){if(generation!==epoch)return;account.status='error';account.error=safeError(error);emit();}
}
export async function initialize(){
 try{const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error('Configuração de contas indisponível.');const config=await response.json();
 if(!config.enabled){account.status='local';account.reason=config.reason||'Modo local sem login.';emit();return;}
 account.enabled=true;const {createClient}=await import('/vendor/supabase.js');client=createClient(config.url,config.key,{auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{if(event==='PASSWORD_RECOVERY')account.recovering=true;if(event==='SIGNED_OUT')account.recovering=false;await switchSession(session);if(account.recovering&&account.status==='ready'){location.hash='account';emit();}},0);});
 const {data,error}=await client.auth.getSession();if(error)throw error;await switchSession(data.session);
 }catch{account.status='error';account.error='Não foi possível abrir o serviço de contas. Seus dados não foram sobrescritos. Recarregue para tentar novamente.';emit();}
}
export function writable(){return account.status==='local'||account.status==='ready';}
export function save(workspace){
 if(!account.enabled||account.status!=='ready')throw Error('Entre e aguarde o carregamento da sua conta.');if(account.error)throw Error('A sincronização está bloqueada. Exporte um backup antes de recarregar.');
 pending=structuredClone(workspace);account.sync='Salvando na conta…';emit('account-sync');if(!draining){const generation=epoch;draining=drain().finally(()=>{if(generation===epoch)draining=null;});}return draining;
}
async function drain(){const owner=account.owner,generation=epoch;
 while(pending&&generation===epoch){const payload=pending;pending=null;const record={user_id:owner,payload,revision:revision+1,updated_at:new Date().toISOString()};try{
 let query=revision===0?client.from('baixatudo_workspaces').insert(record):client.from('baixatudo_workspaces').update(record).eq('user_id',owner).eq('revision',revision);
 const {data,error}=await query.select('revision').maybeSingle();if(generation!==epoch)return;if(error)throw error;if(!data)throw {code:'23505'};revision=data.revision;account.sync=pending?'Salvando na conta…':'Salvo na conta';emit('account-sync');
 }catch(error){if(generation!==epoch)return;pending??=payload;account.error=safeError(error);account.sync='Não sincronizado — exporte um backup antes de sair';emit('account-sync');throw Error(account.error);}
 }
}
export async function submit(mode,email,password){if(!client)throw Error('Cadastro indisponível: reconecte e configure o Supabase.');
 let result;if(mode==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});else if(mode==='reset')result=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#account'});else if(mode==='password')result=await client.auth.updateUser({password});else result=await client.auth.signInWithPassword({email,password});
 if(result.error)throw Error(safeError(result.error));if(mode==='password')account.recovering=false;if(mode==='signup'&&!result.data.session)return 'Cadastro solicitado. Confira seu e-mail para confirmar a conta antes de entrar.';return mode==='reset'?'Se o endereço estiver cadastrado, você receberá instruções por e-mail.':mode==='password'?'Senha atualizada.':'Acesso confirmado.';
}
export async function logout({discard=false}={}){if(!discard){if(draining)await draining;if(pending||account.error)throw Error('Exporte um backup: há alterações não sincronizadas.');}const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Não foi possível encerrar a sessão. Tente novamente.');await switchSession(null);}
export function unsaved(){return Boolean(account.enabled&&(pending||draining||account.error));}
window.addEventListener('beforeunload',event=>{if(unsaved()){event.preventDefault();event.returnValue='';}});
