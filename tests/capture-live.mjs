import assert from 'node:assert/strict';
// Only the owner's existing, public repository. Never probe unrelated targets or disable TLS.
const target='https://github.com/tiumedeiros-cyber/Baixatudo';
const base=process.env.TEST_URL||'http://127.0.0.1:3000';
const response=await fetch(base+'/api/capture',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'live-owner-github'},body:JSON.stringify({url:target,authorized:true}),signal:AbortSignal.timeout(25000)});
const body=await response.json();
assert.equal(response.status,200,body.error||'Captura externa falhou');
assert.equal(body.kind,'baixatudo-evidence');assert.match(body.page.title,/Baixatudo/i);assert.ok(body.page.text.length>100);assert.match(body.page.url,/^https:\/\/github.com\//);
console.log('PASS: actual capture API fetched owner GitHub over validated HTTPS and extracted nonempty evidence. This does NOT prove system reconstruction.');
