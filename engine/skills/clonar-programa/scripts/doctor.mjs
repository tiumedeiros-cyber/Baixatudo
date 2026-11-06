#!/usr/bin/env node
// Verifica o ambiente e a estrutura da skill (não é o "rea doctor").
// Uso: node scripts/doctor.mjs [--json] [--strict]
//   --json    saída em JSON
//   --strict  sai com código 1 se algo obrigatório estiver faltando
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const argv=process.argv.slice(2);
const useJson=argv.includes('--json');
const strict=argv.includes('--strict');
const skillRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MIN_NODE=18;
const MIN_REA='6.7.0';
// O REA (rea-agents 6.x) pede Node ^22.19.0 || ^24.11.0 || >=26.0.0
function nodeFitsRea(version){
  const [major,minor]=version.split('.').map(Number);
  return major>=26||(major===24&&minor>=11)||(major===22&&minor>=19);
}

// status: ok | warn (recomendado) | missing (obrigatório) | broken (estrutura)
const result=(status,label,detail='')=>({status,label,detail});
function quoteArg(text){return /[\s"]/.test(text)?`"${String(text).replace(/"/g,'""')}"`:String(text);}
function call(command,args){
  const options={encoding:'utf8',windowsHide:true,timeout:30000};
  if(process.platform==='win32'&&/^(npm|npx|rea|git)$/i.test(command)){
    return spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',[command,...args].map(quoteArg).join(' ')],{...options,shell:false});
  }
  return spawnSync(command,args,{...options,shell:false});
}
function probe(command,args=['--version']){
  const response=call(command,args);
  if(response.error)return {ok:false,detail:String(response.error.message||'')};
  if(response.status!==0)return {ok:false,detail:String(response.stderr||response.stdout||'').trim().slice(0,200)};
  return {ok:true,detail:String(response.stdout||response.stderr||'ok').trim().split(/\r?\n/)[0].slice(0,200)};
}
function versionAtLeast(found,minimum){
  const a=String(found).match(/\d+/g)?.map(Number)||[];
  const b=minimum.split('.').map(Number);
  for(let i=0;i<b.length;i++){if((a[i]||0)!==b[i])return (a[i]||0)>b[i];}
  return true;
}
function skillInstalled(skillName){
  const home=os.homedir();
  return ['.claude','.codex','.gemini','.agents',path.join('.config','opencode')]
    .some(base=>fs.existsSync(path.join(home,base,'skills',skillName,'SKILL.md')));
}
function skillVersion(){
  try{return /^## \[(\d+\.\d+\.\d+)\]/m.exec(fs.readFileSync(path.join(skillRoot,'CHANGELOG.md'),'utf8'))?.[1]||'desconhecida';}
  catch{return 'desconhecida';}
}
function findBrowser(){
  const env=process.env;
  return [
    env.CHROME_PATH,
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Google/Chrome/Application/chrome.exe'),
    env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),
    env.PROGRAMFILES&&path.join(env.PROGRAMFILES,'Microsoft/Edge/Application/msedge.exe'),
    env['PROGRAMFILES(X86)']&&path.join(env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(candidate=>candidate&&fs.existsSync(candidate))||null;
}

const checks=[];

const nodeMajor=Number(process.versions.node.split('.')[0]);
checks.push(nodeMajor>=MIN_NODE?result('ok','Node.js','v'+process.versions.node):result('missing','Node.js','v'+process.versions.node+' — precisa de '+MIN_NODE+'+'));
const npm=probe('npm');
checks.push(result(npm.ok?'ok':'missing','npm',npm.detail));
const git=probe('git');
checks.push(result(git.ok?'ok':'warn','Git',git.ok?git.detail:'recomendado (rota ZIP funciona sem ele)'));

const rea=probe('rea');
if(!nodeFitsRea(process.versions.node))checks.push(result('warn','Node.js para o REA','v'+process.versions.node+' é antigo para o REA (pede 22.19+, 24.11+ ou 26+); os scripts da skill funcionam, o REA não'));
if(rea.ok){
  checks.push(versionAtLeast(rea.detail,MIN_REA)?result('ok','REA',rea.detail):result('warn','REA',rea.detail+' — atualize para '+MIN_REA+'+ (npm i -g rea-agents@latest)'));
  checks.push(skillInstalled('reverse-engineer-anything')?result('ok','Skill reverse-engineer-anything','instalada'):result('warn','Skill reverse-engineer-anything','não encontrada — rode: node scripts/install-rea.mjs --yes --client <seu-cliente>'));
}else if(skillInstalled('reverse-engineer-anything')){
  checks.push(result('ok','REA','skill instalada; comando "rea" fora do PATH (ok se vier via MCP)'));
}else{
  checks.push(result('warn','REA','não instalado — rode: node scripts/install-rea.mjs --yes --client <seu-cliente>'));
}

let playwrightDetail=null;
try{
  const require=createRequire(path.join(process.cwd(),'package.json'));
  for(const packageName of ['playwright','playwright-core']){
    try{playwrightDetail=packageName+' '+require(packageName+'/package.json').version;break;}catch{}
  }
}catch{}
checks.push(playwrightDetail
  ?result('ok','Playwright (nesta pasta)',playwrightDetail)
  :result('warn','Playwright (nesta pasta)','não encontrado aqui — instale na sua pasta de trabalho: npm init -y, npm i -D playwright, npx playwright install chromium'));
const browser=findBrowser();
checks.push(result(browser?'ok':'warn','Chrome/Edge do sistema',browser||'nenhum encontrado; use o Chromium do Playwright ou --browser'));

if(process.platform==='win32'){
  const ps=probe('powershell',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()']);
  checks.push(result(ps.ok?'ok':'warn','PowerShell (captura desktop)',ps.ok?ps.detail:'necessário para capture-desktop.ps1'));
}

const required=[
  'SKILL.md','README.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md','prompts/INSTALL-LLM.md',
  'references/metodologia.md','references/requisitos.md','references/limitacoes.md','references/legalidade.md',
  'references/licencas-assets.md','references/rea.md','references/web-playwright.md','references/desktop.md','references/checklists.md',
  'templates/INTAKE.md','templates/EVIDENCE-INDEX.md','templates/REA.md','templates/FEATURES.md','templates/CLONE-PLAN.md','templates/VERIFICATION.md',
  'scripts/new-clone.mjs','scripts/capture-web.mjs','scripts/capture-desktop.ps1','scripts/compare-behavior.mjs','scripts/inventory-files.mjs','scripts/install-rea.mjs','scripts/doctor.mjs'
];
const missing=required.filter(relative=>!fs.existsSync(path.join(skillRoot,relative)));
checks.push(missing.length?result('broken','Estrutura da skill','faltando: '+missing.join(', ')):result('ok','Estrutura da skill','completa ('+required.length+' arquivos)'));

const summary={
  version:skillVersion(),
  ok:checks.every(check=>check.status==='ok'||check.status==='warn'),
  pending:checks.filter(check=>check.status==='warn').length,
  checks
};
if(useJson){
  console.log(JSON.stringify(summary,null,2));
}else{
  const icons={ok:'OK',warn:'!!',missing:'XX',broken:'XX'};
  console.log('\nDoctor da skill Clonar Programa v'+summary.version+' (não confunda com "rea doctor")');
  for(const check of checks)console.log(`[${icons[check.status]}] ${check.label}${check.detail?': '+check.detail:''}`);
  console.log('');
  if(!summary.ok)console.log('Falta algo obrigatório (XX). Corrija e rode de novo.');
  else if(summary.pending)console.log('Funciona, com '+summary.pending+' recomendação(ões) (!!) acima.');
  else console.log('Ambiente saudável.');
}
if(!summary.ok&&strict)process.exitCode=1;
