import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readJson} from '../api/lib/json-body.js';
import capture from '../api/capture.js';
import infer from '../api/infer.js';
import {extractEvidence} from '../engine/lib/capture.js';

test('JSON limita bytes UTF-8: objeto processado, string, Buffer e stream',async()=>{
 const object={value:'á'.repeat(30)};
 for(const req of [{body:object},{body:JSON.stringify(object)},{body:Buffer.from(JSON.stringify(object))},Readable.from([JSON.stringify(object)])])await assert.rejects(readJson(req,40),err=>err.status===413);
 const data={value:'á'};const bytes=Buffer.from(JSON.stringify(data));
 assert.deepEqual(await readJson(Readable.from([...bytes].map(byte=>Buffer.from([byte]))),100),data);
 assert.deepEqual(await readJson({body:data},100),data);
 await assert.rejects(readJson({body:'{'},100),SyntaxError);
});

test('APIs recusam corpo processado acima do limite antes de rede externa',async()=>{
 for(const [handler,size] of [[capture,4100],[infer,65010]]){
  let response;
  const res={setHeader(){},end(text){response=JSON.parse(text);}};
  await handler({method:'POST',headers:{host:'studio.example','content-type':'application/json'},socket:{remoteAddress:`size-${size}`},body:{unused:'a'.repeat(size)}},res);
  assert.equal(res.statusCode,413);assert.equal(response.error,'Pedido muito grande.');
 }
});

test('captura remove títulos de formulários e conteúdo oculto das evidências',()=>{
 const evidence=extractEvidence('<body><h1>Público</h1><form><h2>Privado do formulário</h2></form><section hidden><h3>Oculto</h3></section><div aria-hidden="true"><h2>Segredo</h2></div></body>','https://example.com');
 assert.deepEqual(evidence.headings,['Público']);
 assert.doesNotMatch(JSON.stringify(evidence),/Privado|Oculto|Segredo/);
});
