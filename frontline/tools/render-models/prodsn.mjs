import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root='/tmp/claude-0/render';
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));try{r.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(8135);
const SECT=['e','se','s','sw','w','nw','n','ne'];
const TEAMS={blue:0x2f7fe8,red:0xe0403f};
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
for(const [team,col] of Object.entries(TEAMS)){
  const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('http://localhost:8135/view.html?size=160');
  await p.evaluate(c=>{window.TEAM=c},col);
  await p.evaluate(()=>window.loadModel('proc','sniper'));
  for(let k=0;k<8;k++){const d=await p.evaluate(a=>window.shotUnit(...a),[90-45*k,30,40,160,1.1]);
    const f=`${root}/raw/sniper-${team}-${SECT[k]}.png`;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(d.split(',')[1],'base64'));}
  await p.close();}
await b.close();srv.close();
