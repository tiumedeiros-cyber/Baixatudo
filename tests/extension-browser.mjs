import {chromium} from '@playwright/test';
import slim from '@sparticuz/chromium';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
if(!process.env.CHROMIUM_EXECUTABLE){
const libRoot=path.join(os.tmpdir(),'baixatudo-chromium-libs');
await fs.mkdir(libRoot,{recursive:true});
await fs.writeFile(path.join(libRoot,'libs.tar'),brotliDecompressSync(await fs.readFile(new URL('../node_modules/@sparticuz/chromium/bin/al2023.tar.br',import.meta.url))));
execFileSync('tar',['xf',path.join(libRoot,'libs.tar'),'-C',libRoot]);
process.env.LD_LIBRARY_PATH=path.join(libRoot,'lib')+':'+(process.env.LD_LIBRARY_PATH||'');
}
import {createHash} from 'node:crypto';
const extensionPath=path.resolve('extension');const id=createHash('sha256').update(extensionPath).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
const context=await chromium.launchPersistentContext('test-results/extension-profile',{executablePath:process.env.CHROMIUM_EXECUTABLE||await slim.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-extensions-except='+extensionPath,'--load-extension='+extensionPath],ignoreDefaultArgs:['--disable-extensions'],headless:true,acceptDownloads:true});
try{const target=await context.newPage();await target.goto(process.env.TEST_URL||'http://127.0.0.1:3000');const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html',{timeout:15000});await popup.getByRole('heading',{name:'Qual sistema você quer recriar?'}).waitFor({timeout:10000});await popup.locator('#source').selectOption('file');await popup.locator('#target-file').setInputFiles({name:'fonte-propria.html',mimeType:'text/html',buffer:Buffer.from('<h1>Referência própria</h1>')});await popup.locator('#consent').check();await popup.locator('#capture').click();await popup.waitForFunction(()=>document.getElementById('text').value.includes('Referência própria'));const download=popup.waitForEvent('download');await popup.locator('#save').click();const file=await download;const json=JSON.parse(await fs.readFile(await file.path(),'utf8'));assert.equal(json.kind,'baixatudo-evidence');assert.equal(json.page.url,'');assert.match(json.page.text,/Referência própria/);console.log('PASS: unpacked MV3 extension actually loaded in headless Chromium; local file read, reviewed and real JSON downloaded. No Android/optional-host grant validated.');}finally{await context.close();}
