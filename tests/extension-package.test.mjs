import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

test('ZIP publicado corresponde aos arquivos da extensão e à versão anunciada no painel',async()=>{
 const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
 const source=await readFile('src/app.js','utf8');
 assert.ok(source.includes('Extensão v'+manifest.version));
 assert.ok(source.includes('/public/baixatudo-extension.zip?v='+manifest.version));
 assert.ok((await readFile('extension/popup.html','utf8')).includes('v'+manifest.version));
 execFileSync('python',['-c',`from pathlib import Path
from zipfile import ZipFile
with ZipFile('public/baixatudo-extension.zip') as z:
 files=[p for p in Path('extension').iterdir() if p.is_file()]
 assert set(z.namelist())=={p.name for p in files}, 'Pacote tem arquivos ausentes ou extras'
 for p in files:
  assert z.read(p.name)==p.read_bytes(), 'Arquivo desatualizado no ZIP: '+p.name
 assert z.testzip() is None, 'ZIP corrompido'
`],{stdio:'pipe'});
});
