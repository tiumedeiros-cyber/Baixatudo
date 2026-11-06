#!/usr/bin/env node
// Instala o REA (npm: rea-agents) e a skill oficial "reverse-engineer-anything".
// Uso: node install-rea.mjs --check                       (só diagnostica, nunca instala)
//      node install-rea.mjs --yes --client claude_code     (instala; client: opencode, claude_code, codex, ...)
//      node install-rea.mjs --yes --all-detected           (configura todo cliente detectado)
// Extras: --version <x.y.z> fixa a versão do rea-agents (padrão: latest) · --dry-run mostra o plano · --force reinstala a skill
import {spawnSync} from 'node:child_process';

const argv=process.argv.slice(2);
const flag=name=>argv.includes(name);
const value=name=>{const index=argv.indexOf(name);const next=index>=0?argv[index+1]:null;return next&&!next.startsWith('--')?next:null;};
const check=flag('--check');
const yes=flag('--yes')&&!check;
const dry=flag('--dry-run')||check;
const client=value('--client');
const requested=value('--version')||'latest';

if(client&&!/^[a-z0-9_-]+$/i.test(client)){console.error('Valor inválido para --client: use apenas letras, números, "_" e "-" (ex.: claude_code).');process.exit(2);}
if(!/^[a-z0-9.+-]+$/i.test(requested)){console.error('Valor inválido para --version.');process.exit(2);}
if(!client&&!flag('--all-detected')&&yes){
  console.error('Diga onde instalar: --client <opencode|claude_code|codex|...> ou --all-detected (mexe na configuração de todo cliente detectado).');
  process.exit(2);
}

function quoteArg(text){return /[\s"]/.test(text)?`"${String(text).replace(/"/g,'""')}"`:String(text);}
function run(command,args,{inherit=false}={}){
  const options={encoding:'utf8',windowsHide:true,stdio:inherit?'inherit':'pipe'};
  if(process.platform==='win32'&&/^(npm|rea)$/i.test(command)){
    return spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',[command,...args].map(quoteArg).join(' ')],{...options,shell:false});
  }
  return spawnSync(command,args,{...options,shell:false});
}
function reaVersion(){
  const result=run('rea',['--version']);
  return result.error||result.status!==0?null:String(result.stdout||'').trim();
}
function skillState(){
  const raw=String(run('rea',['doctor','--skill','--format','json']).stdout||'').trim();
  try{return JSON.parse(raw)?.identity?.skill?.state||null;}
  catch{return /"skill"\s*:\s*\{[^}]*"state"\s*:\s*"([^"]+)"/.exec(raw)?.[1]||null;}
}
const aligned=state=>state==='aligned'||state==='installed';

let current=reaVersion();
if(current){
  console.log('REA encontrado: '+current);
}else{
  console.log('REA não encontrado neste computador.');
  console.log('Instalação: npm install -g rea-agents@'+requested);
  if(!yes){
    console.log('\nNada foi alterado. Rode de novo com --yes (e --client ...) para instalar o REA e a skill oficial.');
    process.exit(check?0:2);
  }
  console.log('\nInstalando rea-agents@'+requested+' globalmente...');
  const installed=run('npm',['install','-g','rea-agents@'+requested],{inherit:true});
  if(installed.error||installed.status!==0){console.error('Falha ao instalar o REA. Verifique o npm (permissões, rede) e tente de novo.');process.exit(1);}
  current=reaVersion();
  if(!current){console.error('O REA foi instalado, mas o comando "rea" não está no PATH. Abra um novo terminal e rode de novo.');process.exit(1);}
}

const before=skillState();
if(aligned(before)&&!flag('--force')){
  console.log('Skill reverse-engineer-anything já instalada (estado: '+before+'). Nada a fazer.');
  process.exit(0);
}

const setupArgs=['setup','--yes'];
if(client)setupArgs.push('--client',client);else setupArgs.push('--all-detected');

// Mostra sempre o que o setup vai mexer antes de aplicar.
console.log('\nPlano do "rea setup" (nada é alterado nesta etapa):');
const plan=run('rea',[...setupArgs,'--dry-run']);
console.log((String(plan.stdout||'')+String(plan.stderr||'')).split(/\r?\n/).slice(-40).join('\n'));
if(dry||!yes){
  console.log('\n'+(check?'Diagnóstico concluído.':'Nada foi alterado.')+' Para aplicar: node install-rea.mjs --yes '+(client?'--client '+client:'--all-detected'));
  process.exit(0);
}

console.log('\nAplicando...');
const setup=run('rea',setupArgs);
console.log((String(setup.stdout||'')+String(setup.stderr||'')).split(/\r?\n/).slice(-40).join('\n'));

const after=skillState();
if(aligned(after)){
  console.log('\nSkill reverse-engineer-anything instalada (estado: '+after+'). Reinicie o seu cliente (Claude Code, OpenCode, Codex...) para carregar as ferramentas.');
  process.exit(0);
}
console.log('\nA skill ainda não está instalada (estado: '+(after||'desconhecido')+').');
if(setup.status!==0)console.log('O rea setup terminou com código '+setup.status+'.');
console.log('Tente com o cliente explícito: node install-rea.mjs --yes --client claude_code (ou opencode, codex).');
console.log('Se um cliente aberto reescreve a configuração (ex.: Claude Desktop), feche-o e tente de novo.');
process.exit(1);
