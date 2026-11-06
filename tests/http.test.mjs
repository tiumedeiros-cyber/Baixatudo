import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('HTTP real: arquivos, segurança, métodos, validação e limites sem mocks', {timeout:25000}, async t=>{
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',BAIXATUDO_AUTH_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode!==null)return;const closed=once(child,'close');child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await closed;}finally{clearTimeout(timer);}});
 const base=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);child.on('error',reject);child.on('exit',code=>reject(Error('Servidor encerrou: '+code)));child.stdout.on('data',chunk=>{log+=chunk;const found=log.match(/porta (\d+)/);if(found){clearTimeout(timer);resolve('http://127.0.0.1:'+found[1]);}});});
 await t.test('HTML, CSP, HEAD, assets e downloads',async()=>{
  const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Baixatudo/);
  assert.equal(home.headers.get('x-content-type-options'),'nosniff');assert.match(home.headers.get('content-security-policy'),/object-src 'none'/);
  const head=await fetch(base,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  const zip=await fetch(base+'/public/baixatudo-extension.zip');assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');
  for(const path of ['/vendor/supabase.js','/src/app.js'])assert.equal((await fetch(base+path)).status,200);
  for(const path of ['/.env','/.git/config','/%2eenv'])assert.equal((await fetch(base+path)).status,403,path);
  assert.equal((await fetch(base+'/not-found')).status,404);assert.equal((await fetch(base,{method:'DELETE'})).status,405);
 });
 await t.test('config explícita e APIs recusam métodos, outra origem e dados inválidos',async()=>{
  const config=await fetch(base+'/api/config');assert.equal(config.headers.get('cache-control'),'no-store');assert.equal((await config.json()).enabled,false);
  for(const path of ['/api/config','/api/capture','/api/infer'])assert.equal((await fetch(base+path,{method:path==='/api/config'?'POST':'GET'})).status,405);
  for(const path of ['/api/capture','/api/infer']){
   const call=(body,extra={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...extra},body});
   assert.equal((await call('{}',{origin:'https://evil.example'})).status,403);
   assert.equal((await call('{')).status,400);
   assert.equal((await call('{}',{'content-type':'text/plain'})).status,415);
   assert.equal((await call(JSON.stringify({data:'á'.repeat(66000)}))).status,413);
  }
 });
 await t.test('SSRF bloqueado pela API e rate limit exercitado por HTTP',async()=>{
  const call=body=>fetch(base+'/api/capture',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'http-ssrf-suite'},body:JSON.stringify(body)});
  const blocked=await call({url:'http://169.254.169.254/',authorized:true});assert.equal(blocked.status,400);assert.match((await blocked.json()).error,/privad|reservad/);
  for(let n=0;n<4;n++)assert.equal((await call({})).status,400);
  assert.equal((await call({})).status,429);
 });
});
