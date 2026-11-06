import {chromium} from '@playwright/test';
import slim from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const libRoot=path.join(os.tmpdir(),'baixatudo-chromium-libs');
await fs.mkdir(libRoot,{recursive:true});
await fs.writeFile(path.join(libRoot,'libs.tar'),brotliDecompressSync(await fs.readFile(new URL('../node_modules/@sparticuz/chromium/bin/al2023.tar.br',import.meta.url))));
execFileSync('tar',['xf',path.join(libRoot,'libs.tar'),'-C',libRoot]);
process.env.LD_LIBRARY_PATH=path.join(libRoot,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
const browser=await chromium.launch({executablePath:await slim.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
const base=process.env.TEST_URL||'http://127.0.0.1:3000';
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base);await page.getByRole('heading',{name:'Ideias que ganham forma.'}).waitFor();
 await page.getByRole('button',{name:'＋ Novo projeto',exact:true}).click();await page.locator('[name=name]').fill('Edição visual real');await page.getByRole('button',{name:'Criar projeto',exact:false}).click();await page.locator('#code').waitFor();
 await page.getByRole('button',{name:'Selecionar na prévia',exact:true}).click();
 await page.frameLocator('#preview').locator('h1').click();await page.waitForFunction(()=>!document.querySelector('#visual-form fieldset').disabled);
 await page.locator('#visual-form [name=text]').fill('Título editado sem código');await page.locator('#visual-form [name=fontSize]').fill('38');await page.locator('#visual-form [name=color]').fill('#123456');
 await page.getByRole('button',{name:'Aplicar na prévia e salvar'}).click();await page.frameLocator('#preview').getByRole('heading',{name:'Título editado sem código'}).waitFor();
 assert.match(await page.locator('#code').inputValue(),/Título editado sem código/);assert.match(await page.locator('#code').inputValue(),/font-size: 38px/);
 await page.getByRole('button',{name:'Desativar seleção visual',exact:true}).click();await page.frameLocator('#preview').getByRole('button',{name:'Experimentar interação'}).click();await page.frameLocator('#preview').getByText('Sua interação está funcionando.',{exact:false}).waitFor();
 await page.reload();await page.frameLocator('#preview').getByRole('heading',{name:'Título editado sem código'}).waitFor();assert.equal(await page.locator('#preview').getAttribute('sandbox'),'allow-scripts');
 const result=await page.evaluate(async()=>{const {patchElement}=await import('/src/visual-editor.js');let denied=false;try{patchElement('<h1>Original</h1>',{path:[0],tag:'H1',text:'Outro texto'},{text:'não aplicar'});}catch{denied=true;}const escaped=patchElement('<h1>Original</h1>',{path:[0],tag:'H1',text:'Original'},{text:'<img src=x onerror=alert(1)>'});return {denied,escaped};});assert.equal(result.denied,true);assert.match(result.escaped,/&lt;img/);assert.doesNotMatch(result.escaped,/<img/);
 console.log('PASS: real visual selection in sandbox, edit text/style, persisted HTML, automatic version, interactive JS preserved, reload and safe text escaping; 390px mobile emulation, NOT physical Android or arbitrary system/backend editing.');
}finally{await browser.close();}
