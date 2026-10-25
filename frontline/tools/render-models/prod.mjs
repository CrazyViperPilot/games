import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root='/tmp/claude-0/render';
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));try{r.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(8125);
const SECT=['e','se','s','sw','w','nw','n','ne'];
const TEAMS={blue:0x4a6a9a,red:0xa8504a};
const MODELS={
 tank:{kind:'fbx',url:'models/t12/T-12 soviet tank.fbx',size:192},
 apache:{kind:'obj',url:'models/chopper/OBJ/Attack_Helicopter.obj',mtl:'models/chopper/OBJ/Attack_Helicopter.mtl',tex:'models/chopper/Textures/Apache_Texture_White.png',size:192}};
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
for(const [name,m] of Object.entries(MODELS)) for(const [team,col0] of Object.entries(TEAMS)){const col=name==='apache'?(team==='blue'?0x9fbbe6:0xe69a94):col0;
  const p=await b.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('http://localhost:8125/view.html?size='+m.size);
  await p.evaluate(c=>{window.TEAM=c},col);
  await p.evaluate(a=>window.loadModel(...a),[m.kind,m.url,m.mtl,m.tex]);
  for(let k=0;k<8;k++){const yaw=90-45*k;
    const d=await p.evaluate(a=>window.shot(...a),[yaw,30,2]);
    const f=`/tmp/claude-0/render/raw/${name}-${team}-${SECT[k]}.png`;fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(d.split(',')[1],'base64'));}
  await p.close();}
await b.close();srv.close();
