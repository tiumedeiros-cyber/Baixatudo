#!/usr/bin/env node
// Captura uma página web com Playwright: screenshots, HTML, texto, ARIA, elementos, rede,
// console, storage (sem valores), performance e, opcionalmente, corpos de API.
// Segredos óbvios (tokens, JWT, cookies, senhas) são redigidos; a redação é "melhor esforço":
// revise a evidência antes de compartilhar.
// Uso: node capture-web.mjs --url "https://..." --out "<pasta>" [--name home] [--storage auth.json]
//        [--headed] [--timeout 45000] [--browser "<caminho do chrome>"] [--bodies]
// Saída: 0 ok · 2 uso · 3 Playwright ausente · 4 navegador não abriu · 5 página não carregou
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const argv=process.argv.slice(2);
const value=name=>{const index=argv.indexOf(name);const next=index>=0?argv[index+1]:null;return next&&!next.startsWith('--')?next:null;};
const flag=name=>argv.includes(name);
const url=value('--url');
const out=path.resolve(value('--out')||path.join('01-evidence','web'));
const name=(value('--name')||'page').replace(/[^a-z0-9._-]/gi,'_');
const storage=value('--storage');
const timeout=Number(value('--timeout'))||45000;
const withBodies=flag('--bodies');

const usage='Uso: node capture-web.mjs --url "https://..." --out "<pasta>" [--name home] [--storage auth.json] [--headed] [--timeout 45000] [--browser "<chrome>"] [--bodies]';
if(!url||!/^https?:\/\//i.test(url)){console.error(usage);process.exit(2);}

function findBrowser(){
  const env=process.env;
  const candidates=[
    value('--browser'),
    env.CHROME_PATH,
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Microsoft/Edge/Application/msedge.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  return candidates.find(candidate=>candidate&&fs.existsSync(candidate))||null;
}

let chromium,playwrightVersion=null;
try{
  const require=createRequire(path.join(process.cwd(),'package.json'));
  let packageName='playwright';
  try{require.resolve('playwright');}catch{packageName='playwright-core';require.resolve('playwright-core');}
  ({chromium}=require(packageName));
  try{playwrightVersion=require(packageName+'/package.json').version;}catch{}
}catch{
  console.error('Playwright não encontrado em '+process.cwd()+'. Instale na sua pasta de trabalho (de onde você roda os scripts):\n  npm init -y\n  npm i -D playwright\n  npx playwright install chromium\nDepois rode este script de dentro dessa pasta.');
  process.exit(3);
}

// ---- redação ----
const sensitiveKey=/(token|secret|passw(or)?d|passwd|pwd|apikey|api[_-]?key|signature|csrf|xsrf|jwt|bearer|authorization)|(^|[_-])(auth|code|key|sig|sid|session|sessionid)($|[_-])/i;
let redactions=0;
const mark=()=>{redactions+=1;return '[redacted]';};
function redactParams(params){
  for(const key of [...params.keys()])if(sensitiveKey.test(key))params.set(key,mark());
}
function redactUrl(raw){
  try{
    const parsed=new URL(raw);
    redactParams(parsed.searchParams);
    if(parsed.hash.length>1){
      const body=parsed.hash.slice(1);
      const cut=body.indexOf('?');
      if(/^[!/]/.test(body)&&cut<0){/* rota de SPA (#/rota): mantém */}
      else{
        const head=cut>=0?body.slice(0,cut):'';
        const params=new URLSearchParams(cut>=0?body.slice(cut+1):body);
        redactParams(params);
        parsed.hash=head?head+'?'+params.toString():params.toString();
      }
    }
    return parsed.toString();
  }catch{return raw;}
}
function redactText(text){
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,mark)
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,()=>'Bearer '+mark())
    .replace(/(["']?[\w-]*(?:token|secret|passw(?:or)?d|api[_-]?key|csrf|xsrf|authorization)[\w-]*["']?\s*[:=]\s*)(["'])([^"']{4,})\2/gi,(all,head,quote)=>head+quote+mark()+quote)
    .replace(/(<input[^>]*type=["']?(?:password|hidden)["']?[^>]*\svalue=)(["'])(.*?)\2/gi,(all,head,quote)=>head+quote+mark()+quote)
    .replace(/(<meta[^>]*name=["'][^"']*(?:csrf|xsrf)[^"']*["'][^>]*content=)(["'])(.*?)\2/gi,(all,head,quote)=>head+quote+mark()+quote);
}

function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
fs.mkdirSync(out,{recursive:true});
function save(file,data){
  const buffer=Buffer.isBuffer(data)?data:Buffer.from(String(data),'utf8');
  fs.writeFileSync(path.join(out,file),buffer);
  return {file,bytes:buffer.length,sha256:sha256(buffer)};
}

const network=[],consoleLines=[],pageErrors=[],warnings=[],apiBodies=[],pending=[];
const executablePath=findBrowser();
let browser;
try{
  browser=await chromium.launch({headless:!flag('--headed'),executablePath:executablePath||undefined});
}catch(error){
  console.error('Não foi possível abrir o navegador: '+error.message);
  console.error('Instale o Chromium do Playwright (npx playwright install chromium) ou passe --browser "C:\\caminho\\chrome.exe".');
  process.exit(4);
}

let exitCode=0;
try{
  const context=await browser.newContext({
    viewport:{width:1440,height:900},
    locale:'pt-BR',
    timezoneId:'America/Sao_Paulo',
    storageState:storage?path.resolve(storage):undefined
  });
  const page=await context.newPage();
  page.on('console',message=>{
    if(consoleLines.length>=500)return;
    const location=message.location()?.url;
    consoleLines.push({type:message.type(),text:redactText(message.text().slice(0,1000)),location:location?redactUrl(location):null});
  });
  page.on('pageerror',error=>{if(pageErrors.length<100)pageErrors.push(redactText(String(error.message||error).slice(0,1000)));});
  page.on('requestfailed',request=>{
    if(network.length<1500)network.push({method:request.method(),url:redactUrl(request.url()),status:null,failed:request.failure()?.errorText||'failed',type:request.resourceType()});
  });
  page.on('response',response=>{
    if(network.length>=1500)return;
    const request=response.request();
    const headers=response.headers();
    network.push({method:request.method(),url:redactUrl(response.url()),status:response.status(),type:request.resourceType(),contentType:(headers['content-type']||'').split(';')[0]||null,bytes:Number(headers['content-length'])||null});
    if(withBodies&&['fetch','xhr'].includes(request.resourceType())&&apiBodies.length+pending.length<60){
      pending.push((async()=>{
        try{
          const body=await response.text();
          apiBodies.push({method:request.method(),url:redactUrl(response.url()),status:response.status(),requestBody:request.postData()?redactText(request.postData().slice(0,5000)):null,responseBody:redactText(body.slice(0,20000)),truncated:body.length>20000});
        }catch{}
      })());
    }
  });

  let navigationError=null,mainResponse=null;
  try{
    mainResponse=await page.goto(url,{waitUntil:'networkidle',timeout});
  }catch(error){
    navigationError=String(error.message||error).split('\n')[0];
    warnings.push('networkidle falhou ('+navigationError+'); tentando domcontentloaded');
    try{mainResponse=await page.goto(url,{waitUntil:'domcontentloaded',timeout});navigationError=null;}
    catch(second){navigationError=String(second.message||second).split('\n')[0];}
  }
  await page.waitForTimeout(1200);
  await Promise.allSettled(pending);

  const files=[];
  const attempt=async(label,task,fallback)=>{try{return await task();}catch(error){warnings.push(label+': '+String(error.message||error).split('\n')[0]);return fallback;}};

  const shotFull=await attempt('screenshot full',()=>page.screenshot({fullPage:true,type:'png'}),null);
  if(shotFull)files.push(save(`${name}-full.png`,shotFull));
  const shotView=await attempt('screenshot viewport',()=>page.screenshot({fullPage:false,type:'png'}),null);
  if(shotView)files.push(save(`${name}-viewport.png`,shotView));
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  const shotNarrow=await attempt('screenshot estreito',()=>page.screenshot({fullPage:false,type:'png'}),null);
  if(shotNarrow)files.push(save(`${name}-narrow.png`,shotNarrow));
  await page.setViewportSize({width:1440,height:900});

  const html=await attempt('html',()=>page.content(),'');
  files.push(save(`${name}-page.html`,redactText(html)));
  const text=await attempt('texto',()=>page.locator('body').innerText({timeout:5000}),'');
  files.push(save(`${name}-page.txt`,redactText(text)));
  const aria=await attempt('aria (requer Playwright 1.49+)',()=>page.locator('body').ariaSnapshot({timeout:5000}),'');
  files.push(save(`${name}-aria.txt`,redactText(aria)));

  const elements=await attempt('elementos',()=>page.evaluate(()=>{
    const selector='button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"]';
    return [...document.querySelectorAll(selector)].slice(0,800).map((element,index)=>{
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      return {
        index,
        tag:element.tagName.toLowerCase(),
        role:element.getAttribute('role')||null,
        text:(element.innerText||'').replace(/\s+/g,' ').trim().slice(0,160),
        name:element.getAttribute('name')||null,
        label:element.getAttribute('aria-label')||element.getAttribute('title')||null,
        testId:element.getAttribute('data-testid')||element.getAttribute('data-test')||null,
        type:element.getAttribute('type')||null,
        placeholder:element.getAttribute('placeholder')||null,
        href:element.tagName==='A'?element.getAttribute('href'):null,
        disabled:Boolean(element.disabled)||element.getAttribute('aria-disabled')==='true',
        visible:style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0,
        box:{x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}
      };
    });
  }),[]);
  for(const element of elements){
    if(element.href)element.href=redactUrl(new URL(element.href,page.url()).toString());
    if(element.text)element.text=redactText(element.text);
  }
  files.push(save(`${name}-elements.json`,JSON.stringify(elements,null,2)));

  const storageInfo=await attempt('storage',()=>page.evaluate(()=>{
    const clean=store=>{
      const result={};
      for(let index=0;index<store.length;index++){
        const key=store.key(index);
        const raw=store.getItem(key)??'';
        result[key]={length:raw.length,type:raw.startsWith('{')||raw.startsWith('[')?'json':'string'};
      }
      return result;
    };
    return {localStorage:clean(window.localStorage),sessionStorage:clean(window.sessionStorage)};
  }),{localStorage:{},sessionStorage:{}});
  const cookies=(await context.cookies()).map(cookie=>({name:cookie.name,domain:cookie.domain,path:cookie.path,httpOnly:cookie.httpOnly,secure:cookie.secure,sameSite:cookie.sameSite,expires:cookie.expires}));
  files.push(save(`${name}-storage.json`,JSON.stringify({...storageInfo,cookies},null,2)));

  const performance=await attempt('performance',()=>page.evaluate(()=>{
    const navigation=performance.getEntriesByType('navigation')[0];
    const resources=performance.getEntriesByType('resource');
    return {
      navigation:navigation?{duration:Math.round(navigation.duration),domContentLoaded:Math.round(navigation.domContentLoadedEventEnd),load:Math.round(navigation.loadEventEnd),transferSize:navigation.transferSize}:null,
      resources:{count:resources.length,byType:resources.reduce((acc,item)=>{acc[item.initiatorType]=(acc[item.initiatorType]||0)+1;return acc;},{})}
    };
  }),null);

  files.push(save(`${name}-network.json`,JSON.stringify(network,null,2)));
  files.push(save(`${name}-console.json`,JSON.stringify({console:consoleLines,pageErrors},null,2)));
  files.push(save(`${name}-performance.json`,JSON.stringify(performance,null,2)));
  if(withBodies)files.push(save(`${name}-api-bodies.json`,JSON.stringify(apiBodies,null,2)));

  const keepHeaders=['content-type','server','content-security-policy','x-frame-options','cache-control','strict-transport-security'];
  const mainHeaders=mainResponse?Object.fromEntries(Object.entries(mainResponse.headers()).filter(([key])=>keepHeaders.includes(key))):null;
  const manifest={
    ok:!navigationError&&Boolean(shotFull),
    url:redactUrl(url),
    finalUrl:redactUrl(page.url()),
    name,
    capturedAt:new Date().toISOString(),
    viewport:{desktop:'1440x900',narrow:'390x844 (só redimensiona; não emula celular)'},
    navigationError,
    mainResponse:mainResponse?{status:mainResponse.status(),headers:mainHeaders}:null,
    title:await page.title().catch(()=>''),
    tool:{playwright:playwrightVersion,browser:browser.version(),executable:executablePath||'chromium do Playwright',node:process.version,userAgent:await page.evaluate(()=>navigator.userAgent).catch(()=>null)},
    options:{authenticated:Boolean(storage),bodies:withBodies},
    redactions,
    warnings,
    counts:{elements:elements.length,network:network.length,console:consoleLines.length,pageErrors:pageErrors.length,apiBodies:apiBodies.length},
    files
  };
  files.push(save(`${name}-manifest.json`,JSON.stringify(manifest,null,2)));

  console.log('Captura salva em: '+out);
  console.log(JSON.stringify({ok:manifest.ok,title:manifest.title,finalUrl:manifest.finalUrl,counts:manifest.counts,redactions,warnings:warnings.length,files:files.length},null,2));
  if(storage)console.log('Aviso: captura logada pode conter dados pessoais (nomes, e-mails). Revise antes de compartilhar.');
  if(!manifest.ok){console.error('A página não carregou direito: '+(navigationError||'sem screenshot')+'. Veja warnings no manifest.');exitCode=5;}
}finally{
  await browser.close().catch(()=>{});
}
process.exit(exitCode);
