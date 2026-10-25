import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root='/tmp/claude-0/render';
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));try{const d=fs.readFileSync(f);r.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(d);}catch{r.statusCode=404;r.end();}}).listen(8123);
export async function run(jobs){
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 for(const j of jobs){const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('C',m.text())});
  await p.goto('http://localhost:8123/view.html?size='+(j.size||256));
  await p.evaluate(c=>{window.TEAM=c},j.team||0x5b7a4a);await p.evaluate(a=>window.loadModel(...a),[j.kind,j.url,j.mtl,j.tex]);
  const azs=j.azs||[0,45,90,135,180,225,270,315];
  for(const az of azs){const d=await p.evaluate(a=>window.shot(...a),[az+(j.rot||0),j.elev??30,j.len||2]);fs.mkdirSync(path.dirname(j.out(az)),{recursive:true});fs.writeFileSync(j.out(az),Buffer.from(d.split(',')[1],'base64'));}
  await p.close();}
 await b.close();srv.close();}
