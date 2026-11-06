import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import capture from './api/capture.js';
import inference from './api/infer.js';
import config from './api/config.js';
const root=path.join(process.cwd(),'site-output');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.zip':'application/zip','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try {
  if(new URL(req.url,'http://local').pathname==='/api/config')return config(req,res);
  if(new URL(req.url,'http://local').pathname==='/api/capture')return capture(req,res);
  if(new URL(req.url,'http://local').pathname==='/api/infer')return inference(req,res);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if(pathname.split('/').some(p=>p.startsWith('.') && p!=='')){res.writeHead(403);return res.end();}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(!(await stat(file)).isFile())throw Error();
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://raw.githubusercontent.com https://*.supabase.co; object-src 'none'; base-uri 'none'"});
  res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{res.writeHead(404);res.end('Arquivo não encontrado');}
});
server.requestTimeout=15000;
server.headersTimeout=10000;
const port=process.env.PORT===undefined?3000:Number(process.env.PORT);
server.listen(port,'0.0.0.0',()=>console.log('Baixatudo Studio disponível na porta '+server.address().port));
