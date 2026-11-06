#!/usr/bin/env node
// Inventário de um programa instalado: tamanhos, extensões, hashes, pistas de stack,
// arquivos de licença, conteúdo de .asar (Electron) e versão dos executáveis (Windows).
// Uso: node inventory-files.mjs --dir "<pasta>" [--out "<pasta-de-saida>"]
//        [--include-node-modules] [--no-hash] [--no-version-info]
// Saída: inventory.json, inventory.csv, licenses.txt e asar-<n>.json (um por .asar)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const argv=process.argv.slice(2);
const value=name=>{const index=argv.indexOf(name);const next=index>=0?argv[index+1]:null;return next&&!next.startsWith('--')?next:null;};
const flag=name=>argv.includes(name);
const dir=value('--dir');
if(!dir||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory()){
  console.error('Uso: node inventory-files.mjs --dir "<pasta>" [--out "<pasta-de-saida>"] [--include-node-modules] [--no-hash] [--no-version-info]');
  process.exit(2);
}
const root=path.resolve(dir);
const out=path.resolve(value('--out')||path.join('01-evidence','inventory'));
fs.mkdirSync(out,{recursive:true});

const MAX_HASH=200*1024*1024;
const noHash=flag('--no-hash');
const skipNames=new Set(['.git','__pycache__','.cache','Cache','GPUCache','Code Cache']);
if(!flag('--include-node-modules'))skipNames.add('node_modules');

const files=[],extensions={},licenses=[],errors=[];
let skippedSymlinks=0;
const stack={electron:false,node:false,dotnet:false,python:false,cef:false,qt:false,webview2:false,flutter:false,java:false,unity:false,tauri:false,db:[],asar:[],executables:[]};
const licenseName=/^(licen[sc]e|copying|notice|third[-_ ]?party|licenses?\.chromium)/i;

function hashFile(file){
  const hash=crypto.createHash('sha256');
  const fd=fs.openSync(file,'r');
  try{
    const buffer=Buffer.allocUnsafe(1024*1024);
    let read;
    while((read=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,read));
  }finally{fs.closeSync(fd);}
  return hash.digest('hex');
}

function walk(current){
  let entries;
  try{entries=fs.readdirSync(current,{withFileTypes:true});}
  catch(error){errors.push(path.relative(root,current)+': '+error.code);return;}
  for(const entry of entries){
    if(entry.isSymbolicLink()){skippedSymlinks+=1;continue;}
    const full=path.join(current,entry.name);
    if(entry.isDirectory()){
      if(!skipNames.has(entry.name))walk(full);
      continue;
    }
    if(!entry.isFile())continue;
    let stat;
    try{stat=fs.statSync(full);}catch(error){errors.push(path.relative(root,full)+': '+error.code);continue;}
    const relative=path.relative(root,full);
    const extension=(path.extname(entry.name)||'(none)').toLowerCase();
    const lower=entry.name.toLowerCase();
    extensions[extension]=extensions[extension]||{count:0,bytes:0};
    extensions[extension].count+=1;
    extensions[extension].bytes+=stat.size;
    const record={path:relative,bytes:stat.size,ext:extension,sha256:null};
    if(!noHash&&stat.size<=MAX_HASH){
      try{record.sha256=hashFile(full);}catch(error){errors.push(relative+': hash '+error.code);}
    }
    files.push(record);

    if(licenseName.test(entry.name)||extension==='.license')licenses.push(relative);
    if(entry.name==='package.json'){
      try{
        const pkg=JSON.parse(fs.readFileSync(full,'utf8'));
        if(pkg.dependencies?.electron||pkg.devDependencies?.electron)stack.electron=true;
        if(pkg.name||pkg.dependencies)stack.node=true;
      }catch{}
    }
    if(extension==='.asar'){stack.asar.push(relative);stack.electron=true;}
    if(['.db','.sqlite','.sqlite3'].includes(extension))stack.db.push(relative);
    if(['.exe','.dll','.node'].includes(extension))stack.executables.push(relative);
    if(/libcef|chrome_elf/.test(lower))stack.cef=true;
    if(/^qt[56]core/.test(lower))stack.qt=true;
    if(/hostfxr|coreclr|\.deps\.json$|\.runtimeconfig\.json$/.test(lower))stack.dotnet=true;
    if(extension==='.pyc'||/^python\d*\.(exe|dll)$/.test(lower))stack.python=true;
    if(/webview2loader/.test(lower))stack.webview2=true;
    if(/^flutter_windows\.dll$|^libflutter/.test(lower))stack.flutter=true;
    if(extension==='.jar'||/^jvm\.dll$|^libjvm/.test(lower))stack.java=true;
    if(/^unityplayer/.test(lower))stack.unity=true;
    if(lower==='tauri.conf.json')stack.tauri=true;
  }
}
walk(root);

// Lista o conteúdo de um .asar lendo só o cabeçalho (JSON no início do arquivo).
function listAsar(file){
  const fd=fs.openSync(file,'r');
  try{
    const head=Buffer.alloc(16);
    fs.readSync(fd,head,0,16,0);
    const jsonLength=head.readUInt32LE(12);
    if(!jsonLength||jsonLength>200*1024*1024)throw new Error('cabeçalho ASAR inesperado');
    const json=Buffer.alloc(jsonLength);
    fs.readSync(fd,json,0,jsonLength,16);
    const entries=[];
    (function visit(node,prefix){
      for(const [name,child] of Object.entries(node.files||{})){
        const entryPath=prefix?prefix+'/'+name:name;
        if(child.files)visit(child,entryPath);
        else entries.push({path:entryPath,bytes:child.size??null,unpacked:Boolean(child.unpacked)});
      }
    })(JSON.parse(json.toString('utf8')),'');
    return entries;
  }finally{fs.closeSync(fd);}
}
const assetExt=/\.(png|jpe?g|gif|svg|webp|ico|icns|ttf|otf|woff2?|mp3|wav|ogg|mp4|webm|glb|gltf)$/i;
const asarSummary=[];
stack.asar.slice(0,20).forEach((relative,index)=>{
  try{
    const entries=listAsar(path.join(root,relative));
    const assets=entries.filter(entry=>assetExt.test(entry.path));
    const asarLicenses=entries.filter(entry=>licenseName.test(path.basename(entry.path))&&!entry.path.includes('node_modules/'));
    const target=`asar-${index+1}.json`;
    fs.writeFileSync(path.join(out,target),JSON.stringify({asar:relative,totalEntries:entries.length,assets,licenses:asarLicenses,entries},null,2),'utf8');
    asarSummary.push({asar:relative,file:target,entries:entries.length,assets:assets.length,licenses:asarLicenses.length});
  }catch(error){asarSummary.push({asar:relative,error:String(error.message||error)});}
});

// Versão/fabricante dos executáveis (Windows): ajuda a "congelar o alvo".
const versionInfo=[];
if(process.platform==='win32'&&!flag('--no-version-info')){
  const topLevel=files.filter(file=>file.ext==='.exe'&&file.path.split(path.sep).length<=2).slice(0,8);
  for(const exe of topLevel){
    const result=spawnSync('powershell',['-NoProfile','-NonInteractive','-Command','(Get-Item -LiteralPath $env:CLONE_FILE).VersionInfo | Select-Object FileVersion,ProductVersion,ProductName,CompanyName,OriginalFilename | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,CLONE_FILE:path.join(root,exe.path)}});
    try{versionInfo.push({path:exe.path,...JSON.parse(result.stdout)});}catch{}
  }
}

const largest=[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,50).map(file=>({path:file.path,bytes:file.bytes}));
const totalBytes=files.reduce((sum,file)=>sum+file.bytes,0);
const report={
  root,
  generatedAt:new Date().toISOString(),
  options:{hash:!noHash,nodeModules:flag('--include-node-modules')},
  totalFiles:files.length,
  totalBytes,
  skippedSymlinks,
  errors:errors.slice(0,100),
  extensions:Object.fromEntries(Object.entries(extensions).sort((a,b)=>b[1].bytes-a[1].bytes)),
  largest,
  stack:{...stack,executables:stack.executables.slice(0,100),asar:stack.asar.slice(0,20),db:stack.db.slice(0,50)},
  versionInfo,
  asar:asarSummary,
  licenses,
  files
};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(report,null,2),'utf8');
const csvCell=text=>`"${String(text).replace(/"/g,'""')}"`;
fs.writeFileSync(path.join(out,'inventory.csv'),['path,bytes,ext,sha256',...files.map(file=>`${csvCell(file.path)},${file.bytes},${csvCell(file.ext)},${file.sha256||''}`)].join('\n'),'utf8');
fs.writeFileSync(path.join(out,'licenses.txt'),licenses.join('\n')+(licenses.length?'\n':''),'utf8');

console.log('Inventário salvo em: '+out);
console.log(JSON.stringify({totalFiles:report.totalFiles,totalMB:Math.round(totalBytes/1024/1024),stack:report.stack,versionInfo,asar:asarSummary,licenseFiles:licenses.length,errors:errors.length,topExtensions:Object.keys(report.extensions).slice(0,8)},null,2));
