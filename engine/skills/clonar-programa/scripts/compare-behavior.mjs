#!/usr/bin/env node
// Compara duas matrizes JSON de comportamento (alvo x clone) e falha quando divergem.
// A matriz é qualquer JSON: ex. {"casos":[{"entrada":"2+2","saida":"4"}]}.
// Uso: node compare-behavior.mjs --expected alvo.json --actual clone.json
//        [--tolerance 0.0001] [--ignore timestamp,id,$.itens[].criadoEm] [--allow-empty] [--out diff.json]
// --ignore: nomes de chave ou caminhos ($.a.b[].c) a desconsiderar (datas, ids gerados).
// Saída: 0 paridade · 1 divergência · 2 erro de uso, arquivo ou JSON inválido, ou nada para comparar
import fs from 'node:fs';
import path from 'node:path';

const argv=process.argv.slice(2);
const value=name=>{const index=argv.indexOf(name);const next=index>=0?argv[index+1]:null;return next&&!next.startsWith('--')?next:null;};
const expectedPath=value('--expected');
const actualPath=value('--actual');
const outPath=value('--out');
const tolerance=Number(value('--tolerance')||0);
const allowEmpty=argv.includes('--allow-empty');
const ignore=(value('--ignore')||'').split(',').map(item=>item.trim()).filter(Boolean);

function fail(message){console.error(message);process.exit(2);}
if(!expectedPath||!actualPath)fail('Uso: node compare-behavior.mjs --expected <alvo.json> --actual <clone.json> [--tolerance 0.0001] [--ignore chave1,$.a[].b] [--allow-empty] [--out diff.json]');
if(!Number.isFinite(tolerance)||tolerance<0)fail('--tolerance deve ser um número maior ou igual a zero.');

function load(file){
  if(!fs.existsSync(file))fail('Arquivo não encontrado: '+file);
  try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));}
  catch(error){fail('JSON inválido em '+file+': '+error.message);}
}
const expected=load(expectedPath);
const actual=load(actualPath);

const differences=[];
let compared=0,ignored=0;
const LIMIT=500;

function add(pathname,expectedValue,actualValue,reason){
  if(differences.length<LIMIT)differences.push({path:pathname,expected:expectedValue,actual:actualValue,reason});
}
function isIgnored(pathname,key){
  const generic=pathname.replace(/\[\d+\]/g,'[]');
  return ignore.some(rule=>rule===key||rule===generic||rule===pathname);
}
function equal(a,b){
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=tolerance;
  return a===b;
}
function compare(a,b,pathname,key){
  if(isIgnored(pathname,key)){ignored+=1;return;}
  const aLeaf=a===null||typeof a!=='object';
  const bLeaf=b===null||typeof b!=='object';
  if(aLeaf||bLeaf){
    compared+=1;
    if(!equal(a,b))add(pathname,a,b,'valor diferente');
    return;
  }
  if(Array.isArray(a)!==Array.isArray(b)){compared+=1;add(pathname,a,b,'tipo diferente (array/objeto)');return;}
  if(Array.isArray(a)){
    if(a.length!==b.length){compared+=1;add(pathname+'.length',a.length,b.length,'tamanho diferente');}
    for(let index=0;index<Math.max(a.length,b.length);index++){
      if(index>=a.length){compared+=1;add(`${pathname}[${index}]`,undefined,b[index],'item extra no clone');}
      else if(index>=b.length){compared+=1;add(`${pathname}[${index}]`,a[index],undefined,'item ausente no clone');}
      else compare(a[index],b[index],`${pathname}[${index}]`,String(index));
    }
    return;
  }
  for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
    const child=`${pathname}.${k}`;
    if(isIgnored(child,k)){ignored+=1;continue;}
    if(!(k in b)){compared+=1;add(child,a[k],undefined,'chave ausente no clone');}
    else if(!(k in a)){compared+=1;add(child,undefined,b[k],'chave extra no clone');}
    else compare(a[k],b[k],child,k);
  }
}

compare(expected,actual,'$','$');

if(compared===0&&!allowEmpty){
  fail('Nada para comparar (as duas matrizes estão vazias ou tudo foi ignorado). Isso não prova paridade. Use --allow-empty se for intencional.');
}

const report={
  expected:path.resolve(expectedPath),
  actual:path.resolve(actualPath),
  tolerance,
  ignore,
  compared,
  ignored,
  comparedAt:new Date().toISOString(),
  differences,
  pass:differences.length===0
};
if(outPath)fs.writeFileSync(outPath,JSON.stringify(report,null,2),'utf8');
if(report.pass){
  console.log(`Paridade: PASS (${compared} valores comparados, ${ignored} ignorados)`);
  process.exit(0);
}
console.log(`Paridade: FAIL (${differences.length} diferença(s)${differences.length>=LIMIT?'; limite de '+LIMIT:''}; ${compared} valores comparados)`);
for(const difference of differences.slice(0,25)){
  console.log(`- ${difference.path}: ${difference.reason}`);
  console.log(`  esperado: ${JSON.stringify(difference.expected)}`);
  console.log(`  atual:    ${JSON.stringify(difference.actual)}`);
}
if(differences.length>25)console.log(`... e mais ${differences.length-25}`);
if(outPath)console.log('Relatório: '+outPath);
process.exit(1);
