#!/usr/bin/env node
// Cria o workspace padrão de um clone (web ou desktop) e copia os templates.
// Nunca sobrescreve arquivo existente: com --force só cria o que falta na pasta.
// Uso: node new-clone.mjs --target "<url-ou-caminho>" --name "<nome>" [--dir "<pasta>"] [--force]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const skillRoot=path.resolve(here,'..');
const templates=path.join(skillRoot,'templates');

const argv=process.argv.slice(2);
const value=name=>{const index=argv.indexOf(name);const next=index>=0?argv[index+1]:null;return next&&!next.startsWith('--')?next:null;};
const flag=name=>argv.includes(name);

const usage='Uso: node new-clone.mjs --target "<url-ou-caminho>" --name "<nome>" [--dir "<pasta>"] [--force]';
const target=value('--target');
const name=value('--name');
if(!target||!name){console.error(usage);process.exit(2);}

if(/\.(apk|xapk|aab|ipa)$/i.test(target)){
  console.error('Apps de celular (APK/IPA) não são suportados por esta skill. Use um alvo web (URL) ou desktop (programa instalado).');
  process.exit(2);
}

const slug=String(name).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'clone';
const dir=path.resolve(value('--dir')||path.join('clones',slug));
if(fs.existsSync(dir)&&fs.readdirSync(dir).length>0&&!flag('--force')){
  console.error('A pasta já existe e não está vazia: '+dir+'\nUse --force para completar a estrutura. Arquivos existentes nunca são sobrescritos.');
  process.exit(1);
}

const isWeb=/^https?:\/\//i.test(target);
const isDesktop=!isWeb&&(/\.(exe|dll|app|asar|msix|appx|msi)$/i.test(target)||fs.existsSync(target));
const targetType=isWeb?'web':isDesktop?'desktop':'unknown';
if(targetType==='unknown'){
  console.error('Não entendi o alvo: "'+target+'". Use uma URL completa (https://...) ou o caminho de um programa instalado.');
  process.exit(2);
}

const folders=['00-intake',`01-evidence/${targetType}`,'02-rea','03-spec','04-build','05-verification','06-delivery'];
if(targetType==='desktop')folders.push('01-evidence/target');
for(const folder of folders)fs.mkdirSync(path.join(dir,folder),{recursive:true});

const vars={'{{NAME}}':name,'{{TARGET}}':target,'{{DATE}}':new Date().toISOString().slice(0,10),'{{DIR}}':dir};
const created=[],kept=[];
function writeNew(destination,text){
  const to=path.join(dir,destination);
  if(fs.existsSync(to)){kept.push(destination);return;}
  fs.writeFileSync(to,text,'utf8');
  created.push(destination);
}

const copies=[
  ['INTAKE.md','00-intake/INTAKE.md'],
  ['EVIDENCE-INDEX.md','01-evidence/EVIDENCE-INDEX.md'],
  ['REA.md','03-spec/REA.md'],
  ['FEATURES.md','03-spec/FEATURES.md'],
  ['CLONE-PLAN.md','03-spec/CLONE-PLAN.md'],
  ['VERIFICATION.md','05-verification/VERIFICATION.md']
];
for(const [source,destination] of copies){
  let text=fs.readFileSync(path.join(templates,source),'utf8');
  for(const [key,val] of Object.entries(vars))text=text.split(key).join(val);
  writeNew(destination,text);
}

writeNew('README.md',`# ${name}\n\nClone de ${target}.\n\n## Estrutura\n\n- \`00-intake/\` — intake e escopo\n- \`01-evidence/\` — capturas, screenshots, inventário, índice\n- \`02-rea/\` — grafos e relatórios do REA\n- \`03-spec/\` — arquitetura, funcionalidades, plano\n- \`04-build/\` — implementação própria\n- \`05-verification/\` — testes e paridade\n- \`06-delivery/\` — entrega, créditos, pendências\n\nComece por \`00-intake/INTAKE.md\`.\n`);
writeNew('.gitignore','# segredos e sessões\nauth.json\n*.auth.json\n.env\n# evidência pesada: versione só o índice, os hashes e os resumos\n02-rea/*.json\n01-evidence/target/\nnode_modules/\n');

console.log('Workspace: '+dir);
console.log('Tipo detectado: '+targetType);
if(created.length)console.log('Criados: '+created.join(', '));
if(kept.length)console.log('Mantidos (já existiam): '+kept.join(', '));
console.log('\nPróximos passos:');
console.log('1. Preencha 00-intake/INTAKE.md.');
console.log('2. Rode a captura:');
if(targetType==='web'){
  console.log(`   node "${path.join(skillRoot,'scripts','capture-web.mjs')}" --url "${target}" --out "${path.join(dir,'01-evidence','web')}" --name home`);
}else if(process.platform==='win32'){
  console.log(`   powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(skillRoot,'scripts','capture-desktop.ps1')}" -ListWindows`);
  console.log(`   (depois repita com -Title "<janela>" -OutDir "${path.join(dir,'01-evidence','desktop')}")`);
}else{
  console.log('   desktop fora do Windows: veja references/desktop.md (AXUIElement no macOS, AT-SPI no Linux).');
}
console.log('3. Registre cada evidência em 01-evidence/EVIDENCE-INDEX.md.');
console.log('4. Rode o REA e escreva 03-spec/REA.md; depois FEATURES.md e CLONE-PLAN.md.');
