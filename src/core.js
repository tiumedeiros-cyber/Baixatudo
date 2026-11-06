export const STORAGE_KEY='baixatudo.studio.v1';
export const MAX_IMPORT=10*1024*1024;
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,max=1000000)=>typeof v==='string'?v.slice(0,max):'';
export function validateUrl(value){
 if(!value.trim())return '';
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use uma URL http ou https, sem senha ou usuário.');
 return u.href;
}
export function normalizeBackup(raw){
 if(!raw||raw.version!==1||!Array.isArray(raw.projects)||raw.projects.length>100)throw Error('Backup inválido. Use um backup do Baixatudo Studio (até 100 projetos).');
 const seen=new Set();
 const projects=raw.projects.map(p=>{
  if(!p||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id)||seen.has(p.id)||!p.files||typeof p.files!=='object')throw Error('Projeto inválido ou identificador repetido.');
  seen.add(p.id);
  const files={html:text(p.files.html),css:text(p.files.css),js:text(p.files.js)};
  return {id:p.id,name:text(p.name,100)||'Sem nome',target:validateUrl(text(p.target,2000)),createdAt:text(p.createdAt,40),updatedAt:text(p.updatedAt,40),brief:text(p.brief,6000),relation:text(p.relation,100),excluded:text(p.excluded,3000),files,aiReport:p.aiReport&&typeof p.aiReport==='object'?{summary:text(p.aiReport.summary,2000),limitations:Array.isArray(p.aiReport.limitations)?p.aiReport.limitations.slice(0,10).map(x=>text(x,500)):[],at:text(p.aiReport.at,40)}:null,evidence:Array.isArray(p.evidence)?p.evidence.slice(0,10).map(e=>({title:text(e.title,300),url:validateUrl(text(e.url,2000)),text:text(e.text,100000),capturedAt:text(e.capturedAt,40)})):[],versions:Array.isArray(p.versions)?p.versions.slice(-10).map(v=>({at:text(v.at,40),files:{html:text(v.files?.html),css:text(v.files?.css),js:text(v.files?.js)}})):[]};
 });
 return {version:1,projects,settings:{name:text(raw.settings?.name,80)||'Meu espaço',autosave:raw.settings?.autosave!==false}};
}
export function starterFiles(name){
 return {html:`<main class="page">\n  <span class="eyebrow">PROJETO INICIAL · CÓDIGO PRÓPRIO</span>\n  <h1>${escapeHtml(name)}</h1>\n  <p>Uma ideia, um espaço para começar. Edite o código e acompanhe sua página ganhar forma.</p>\n  <button id="hello">Experimentar interação ↗</button>\n  <p id="message" aria-live="polite"></p>\n</main>`,css:`* { box-sizing: border-box; }\nbody { margin: 0; background: #f5f1e9; color: #26372e; font-family: system-ui, sans-serif; }\n.page { max-width: 760px; padding: 80px 36px; margin: auto; }\n.eyebrow { font-size: 11px; letter-spacing: 2px; }\nh1 { font-size: clamp(40px, 8vw, 72px); letter-spacing: -3px; line-height: 1.05; margin: 26px 0; }\np { line-height: 1.7; max-width: 480px; color: #627065; }\nbutton { border: 0; border-radius: 8px; padding: 15px 22px; background: #294b3b; color: white; cursor: pointer; margin-top: 20px; }`,js:`document.querySelector('#hello')?.addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Sua interação está funcionando. Este é um exemplo original, não uma clonagem.';\n});`};
}
export function buildDocument(files,{preview=false}={}){
 const policy="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 // Close delimiters must not escape their raw-text elements.
 return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${preview?`<meta http-equiv="Content-Security-Policy" content="${policy}">`:''}<style>${files.css.replace(/<\/style/gi,'<\\/style')}</style></head><body>${files.html}<script>${files.js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
export function importEvidence(raw){
 if(!raw||raw.kind!=='baixatudo-evidence'||raw.version!==1||!raw.page)throw Error('Captura inválida. Use o arquivo gerado pela extensão.');
 return {title:text(raw.page.title,300),url:validateUrl(text(raw.page.url,2000)),text:text(raw.page.text,100000),capturedAt:text(raw.page.capturedAt,40)};
}
