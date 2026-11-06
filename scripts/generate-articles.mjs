import fs from 'node:fs';import path from 'node:path';import matter from 'gray-matter';import {marked} from 'marked';import sanitize from 'sanitize-html';
const root=process.cwd(),dir=path.join(root,'content/posts'),out=path.join(root,'dist/insights');fs.mkdirSync(out,{recursive:true});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const entries=[];
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.md'))){const slug=file.slice(0,-3);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))continue;const {data,content}=matter(fs.readFileSync(path.join(dir,file),'utf8'));if(data.status!=='published')continue;
 const title=escape(data.title||slug),cat=escape(data.category||'Insights'),date=escape(String(data.date||'').slice(0,10)),excerpt=escape(data.excerpt||'');
 const body=sanitize(marked.parse(content),{allowedTags:[...sanitize.defaults.allowedTags,'img','figure','figcaption','h1','h2'],allowedAttributes:{...sanitize.defaults.allowedAttributes,img:['src','alt','title','width','height'],a:['href','name','target','rel']},allowedSchemes:['http','https','mailto'],allowProtocolRelative:false});
 const html=`<!doctype html><html lang="en"><head><script>try{document.documentElement.dataset.theme=localStorage.getItem("pl-theme")||"dark"}catch(e){document.documentElement.dataset.theme="dark"}</script><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${excerpt}"><title>${title} | Pennington Labs</title><link rel="stylesheet" href="/styles.css"></head><body id="top"><header class="site-header"><nav class="container nav"><a class="brand" href="/">Pennington Labs</a><div class="links"><a href="#top" aria-label="Back to top of page">↑ Top</a><a href="/">Home</a><a href="/insights/">Insights</a><a href="/contact.html">Contact</a><button class="theme-toggle" type="button" aria-label="Switch color theme">☀ Light</button></div></nav></header><main class="container"><article class="article"><a class="back" href="/insights/">← All insights</a><p class="eyebrow">${cat} · ${date}</p><h1 class="section-title">${title}</h1><p class="lead">${excerpt}</p>${body}</article></main><footer class="footer"><div class="container footer-inner">© Pennington Labs · Software built for the real world.</div></footer><script defer src="/theme.js"></script></body></html>`;
 const dest=path.join(out,slug);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'index.html'),html);entries.push({slug,title,cat,excerpt,date});
}
entries.sort((a,b)=>b.date.localeCompare(a.date));
const listing=path.join(out,'index.html');
if(fs.existsSync(listing)){
  let html=fs.readFileSync(listing,'utf8');
  const start='<!-- ADMIN_POSTS_START -->';
  const end='<!-- ADMIN_POSTS_END -->';
  if(!html.includes(start)||!html.includes(end)){
    throw new Error('Insights listing missing ADMIN_POSTS markers. Update insights/index.html before building.');
  }
  const cards=entries.map(p=>`<article class="panel"><span class="small">${p.cat.toUpperCase()} · ${p.date}</span><h3>${p.title}</h3><p>${p.excerpt}</p><a class="card-link" href="/insights/${p.slug}/">Read article →</a></article>`).join('');
  const a=html.indexOf(start)+start.length;
  const b=html.indexOf(end,a);
  if(b<0)throw new Error('Missing closing ADMIN_POSTS marker.');
  html=html.slice(0,a)+cards+html.slice(b);
  fs.writeFileSync(listing,html);
}
console.log(`Generated ${entries.length} published articles`);
