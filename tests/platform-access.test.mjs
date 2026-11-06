import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizePlatformRequest} from '../engine/lib/platform-access.js';
import {readFile} from 'node:fs/promises';
const env={BAIXATUDO_AUTH_ENABLED:'true',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const req={headers:{authorization:'Bearer fixture.signed.token'}};
test('gate exige sessão e falha fechado sem chamar o provedor',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not fetch');};
 await assert.rejects(authorizePlatformRequest({headers:{}},'capture',{env,fetcher}),e=>e.status===401);
 assert.equal(calls,0);
 await assert.rejects(authorizePlatformRequest(req,'capture',{env,fetcher}),e=>e.status===503);
 assert.equal(calls,1);
});
test('gate usa JWT do solicitante, chave publicável e RPC de reserva no servidor',async()=>{
 await authorizePlatformRequest(req,'inference',{env,fetcher:async(url,options)=>{
  assert.equal(url.href,'https://fixture.supabase.co/rest/v1/rpc/baixatudo_reserve_request');
  assert.equal(options.headers.Authorization,req.headers.authorization);assert.equal(options.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);assert.deepEqual(JSON.parse(options.body),{p_action:'inference'});
  return Response.json({allowed:true});
 }});
 for(const [reason,status] of [['quota',429],['blocked',403],['disabled',403],['unexpected',503]])await assert.rejects(authorizePlatformRequest(req,'inference',{env,fetcher:async()=>Response.json({allowed:false,reason})}),e=>e.status===status);
 await assert.rejects(authorizePlatformRequest(req,'capture',{env,fetcher:async()=>Response.json({error:'secret should never be forwarded'},{status:401})}),e=>e.status===401&&!e.message.includes('secret'));
});
test('admin não depende de e-mail fixo, senha no fonte nem metadados editáveis',async()=>{
 const sql=await readFile('supabase/migrations/202611060002_platform_admin.sql','utf8');
 assert.match(sql,/security definer set search_path=''/);assert.match(sql,/for update/);assert.match(sql,/ai_used>=ent.ai_limit/);assert.match(sql,/revoke all on public.baixatudo_admins from anon, authenticated/);
 assert.doesNotMatch(sql,/aliceoliveira|user_metadata/);
});
