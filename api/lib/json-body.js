// Enforce the same byte limit for Node streams and already-parsed serverless bodies.
export async function readJson(req, maxBytes) {
 let body=req.body;
 const check=value=>{if(Buffer.byteLength(value,'utf8')>maxBytes)throw Object.assign(Error('Pedido muito grande.'),{status:413});return value;};
 if(body===undefined){const chunks=[];let bytes=0;for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;if(bytes<=maxBytes)chunks.push(buffer);else chunks.length=0;}if(bytes>maxBytes)throw Object.assign(Error('Pedido muito grande.'),{status:413});body=Buffer.concat(chunks).toString('utf8');}
 if(Buffer.isBuffer(body))body=body.toString('utf8');
 if(typeof body==='string')return JSON.parse(check(body));
 check(JSON.stringify(body)??'');return body;
}
