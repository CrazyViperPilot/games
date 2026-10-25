import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root='/tmp/claude-0/render';
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));try{r.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(8129);
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8129/view.html?size=384');
await p.evaluate(()=>window.loadModel('proc','tower'));
for(let r=0;r<4;r++){await p.evaluate(q=>{window.rotQ=q},r);const d=await p.evaluate(a=>window.shotRaw(...a),[45,30,64,384]);
 const f=`${root}/raw/tower-r${r}.png`;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(d.split(',')[1],'base64'));}
await b.close();srv.close();
