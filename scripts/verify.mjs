import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {once} from 'node:events';
const startedAt=new Date().toISOString();
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
const steps=[];
async function run(name,args,classification,env={}){
 console.log('\n### '+name);
 const start=Date.now();
 const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{process.stdout.write(chunk);output=(output+chunk).slice(-50000);});
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},150000);
 const killer=setTimeout(()=>child.kill('SIGKILL'),155000);
 const code=await new Promise(resolve=>{child.on('error',()=>resolve(-1));child.on('close',resolve);});clearTimeout(timer);clearTimeout(killer);
 steps.push({name,classification,status:code===0&&!timedOut?'pass':'fail',exitCode:code,timedOut,durationMs:Date.now()-start});
 // Only local/non-secret suites are logged here. Live credentials must never enter this runner.
 await writeFile('test-results/'+name+'.log',output);
 return code===0&&!timedOut;
}
await mkdir('test-results',{recursive:true});
let server;
try{
 await run('syntax',['--run','check'],'static');
 await run('dependencies',['--run','security'],'npm vulnerability advisory audit (not a security certification)');
 const built=await run('build',['scripts/build.mjs'],'real-build');
 if(built){
  await run('unit-http',['--test',...(await readdir('tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name)],'unit + real HTTP; upstream fixtures identified by suite');
  server=spawn(process.execPath,['--use-system-ca','server.mjs'],{env:{...process.env,PORT:'0',BAIXATUDO_AUTH_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  const base=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Servidor de testes não iniciou')),10000);const fail=err=>{clearTimeout(timer);reject(err);};server.once('error',fail);server.once('exit',code=>fail(Error('Servidor encerrou: '+code)));server.stdout.on('data',chunk=>{log+=chunk;const match=log.match(/porta (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});});
  const env={TEST_URL:base};
  await run('browser',['tests/browser.mjs'],'real Chromium desktop/mobile emulation; AI/extension transports simulated',env);
  await run('visual-browser',['tests/visual-browser.mjs'],'real static HTML visual editing, sandbox, persistence; NOT full-system runtime',env);
  await run('accounts-browser',['tests/accounts-browser.mjs'],'real UI; controlled SDK/backend (NOT Supabase login)',env);
  await run('extension-browser',['tests/extension-browser.mjs'],'attempt actual unpacked MV3 extension; NOT Android',env);
  await run('capture-live',['tests/capture-live.mjs'],'real API + HTTPS to owner public GitHub repository',env);
 }
}catch(error){steps.push({name:'orchestration',status:'fail',message:error.message});}
finally{
 if(server&&server.exitCode===null){const closed=once(server,'close');server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),3000);try{await closed;}finally{clearTimeout(timer);}}
 const blockers=[
  {id:'public-api-abuse',status:'blocked',reason:'Captura e inferência têm reserva durável por conta e autenticação no servidor; teste de carga/abuso distribuído ainda não executado.'},
  {id:'signup-email',status:'blocked',reason:'SMTP e recebimento da confirmação/recuperação não validados; não desativar confirmação.'},
  {id:'live-account-e2e',status:'blocked',reason:'Ciclo real de duas contas no navegador, incluindo expiração, login e recuperação, ainda não executado. Teste SQL RLS anterior é evidência separada.'},
  {id:'real-generation',status:'blocked',reason:'Sem provedor/credencial autorizada ou GPU compatível com inferência real validada; fixtures não comprovam qualidade.'},
  {id:'android-extension',status:'blocked',reason:'Kiwi/Android físico, instalação, permissão e captura real ainda não validados.'},
  {id:'system-cloning',status:'blocked',reason:'Executor isolado e reconstrução completa de sistema/backend não implementados. Editor de rascunhos não satisfaz esse requisito.'}
 ];
 const report={startedAt,finishedAt:new Date().toISOString(),revision,dirty,steps,blockers,releaseReady:false};
 await writeFile('test-results/verification.json',JSON.stringify(report,null,2)+'\n');
 const markdown=['# Relatório automático de validação','',`Execução: ${startedAt}`,`Commit: ${revision}${dirty?' (com alterações locais)':''}`,'','**Produção: BLOQUEADA. Não há aprovação integral.**','','## Testes executados','',...steps.map(s=>`- **${s.status.toUpperCase()}** — ${s.name}: ${s.classification||s.message}`),'','## Bloqueios de produção','',...blockers.map(b=>`- **${b.id}:** ${b.reason}`),'','Os logs locais estão em test-results/. Resultados de fixtures não são validação dos serviços externos. Nenhum teste compra serviços ou desativa confirmação de e-mail.',''].join('\n');
 await writeFile('test-results/RELATORIO.md',markdown);
 console.log('\n'+markdown);
 process.exitCode=steps.some(s=>s.status==='fail')||process.argv.includes('--release')?1:0;
}
