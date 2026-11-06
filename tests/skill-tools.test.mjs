import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const scripts='engine/skills/clonar-programa/scripts/';
test('skill real: gerador cria estrutura, mas não inventa implementação; comparador detecta divergência',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'baixatudo-skill-'));
 try{
  const dir=path.join(root,'workspace');
  execFileSync(process.execPath,[scripts+'new-clone.mjs','--target','https://github.com/tiumedeiros-cyber/Baixatudo','--name','Auditoria de ferramentas','--dir',dir],{stdio:'pipe'});
  assert.deepEqual(await readdir(path.join(dir,'04-build')),[],'Workspace vazio não é clone pronto');
  const expected=path.join(root,'expected.json'),actual=path.join(root,'actual.json');
  await writeFile(expected,JSON.stringify({count:2}));await writeFile(actual,JSON.stringify({count:2}));
  assert.equal(spawnSync(process.execPath,[scripts+'compare-behavior.mjs','--expected',expected,'--actual',actual]).status,0);
  await writeFile(actual,JSON.stringify({count:3}));
  assert.equal(spawnSync(process.execPath,[scripts+'compare-behavior.mjs','--expected',expected,'--actual',actual]).status,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
