import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist,{recursive:true});
const skip=new Set(['dist','node_modules','.git','.netlify','admin','content','scripts','lib','netlify','package.json','package-lock.json','netlify.toml','.gitignore','.env','.env.example','README-ADMIN.md']);
for(const name of fs.readdirSync(root)){if(skip.has(name)||name.startsWith('.env')||name.endsWith('.zip'))continue;const src=path.join(root,name);fs.cpSync(src,path.join(dist,name),{recursive:true});}
if(!fs.existsSync(path.join(dist,'index.html')))throw Error('Missing existing website index.html; copy your site files into the repo before building.');
// Add discreet login only if not already present (to current homepage and interior pages).
for(const rel of ['index.html','contact.html','merch.html','insights/index.html']){const f=path.join(dist,rel);if(!fs.existsSync(f))continue;let html=fs.readFileSync(f,'utf8');if(!html.includes('/admin/')){html=html.replace(/(<\/footer>)/i,'<div style="max-width:1100px;margin:0 auto;padding:0 22px 14px;font-size:11px;opacity:.65"><a href="/admin/" aria-label="Admin login">🔒 Admin Login</a></div>$1');fs.writeFileSync(f,html)}}
console.log('Copied current public site; admin footer link injected in deploy output.');
