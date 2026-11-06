import matter from 'gray-matter';
import {requireAdmin,safeError,error} from '../../lib/server-auth.mjs';
import {readFile,listFiles,writeFile,deleteFile,location} from '../../lib/github.mjs';
const slugOk=s=>typeof s==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=100;
const norm=(s,max=200)=>String(s||'').trim().slice(0,max);
const parse=(raw,slug,status)=>{const {data,content}=matter(raw);return{title:data.title||slug,slug,category:data.category||'Development Notes',date:data.date?String(data.date).slice(0,10):'',excerpt:data.excerpt||'',featuredImage:data.featuredImage||'',body:content,status}}
const contentOf=p=>matter.stringify(p.body.trim()+'\n',{title:p.title,slug:p.slug,date:p.date,category:p.category,excerpt:p.excerpt,featuredImage:p.featuredImage,status:p.status});
async function list(){const all=[];for(const status of ['published','draft']){const l=location(status,'_');const files=await listFiles(l.kind,l.path.replace('/_.md',''));if(!Array.isArray(files))continue;for(const file of files){if(!file.name.endsWith('.md'))continue;const slug=file.name.slice(0,-3);try{const f=await readFile(l.kind,`${l.path.replace('/_.md','')}/${file.name}`);const p=parse(f.text,slug,status);all.push({title:p.title,slug,status,category:p.category,date:p.date})}catch(e){if(e.status!==404)throw e}}}return all.sort((a,b)=>b.date.localeCompare(a.date))}
export default async function handler(req){try{
 await requireAdmin(req);
 const url=new URL(req.url);
 if(req.method==='GET'){
 const slug=url.searchParams.get('slug');if(!slug)return Response.json({posts:await list()});
 const status=url.searchParams.get('status');if(!slugOk(slug)||!['draft','published'].includes(status))return error(400,'Invalid article identifier');
 const l=location(status,slug);const f=await readFile(l.kind,l.path);return Response.json({post:parse(f.text,slug,status)})
 }
 if(req.method==='POST'){
 const x=await req.json();const slug=x.slug,status=x.status,previousStatus=x.previousStatus;
 if(!slugOk(slug)||!['draft','published'].includes(status)||!x.title?.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(x.date||''))return error(400,'Title, slug, and valid date are required');
 if(x.originalSlug&&x.originalSlug!==slug)return error(400,'Existing article URLs cannot be changed');
 if(x.body?.length>250000)return error(413,'Post content is too large');
 const p={slug,status,title:norm(x.title),category:norm(x.category,80),date:x.date,excerpt:norm(x.excerpt,500),featuredImage:norm(x.featuredImage,500),body:String(x.body||'')};
 const l=location(status,slug);let sha;try{sha=(await readFile(l.kind,l.path)).sha}catch(e){if(e.status!==404)throw e}
 // Protect existing hand-written legacy article URLs from accidental collisions.
 if(status==='published'&&!x.originalSlug){for(const legacy of [`insights/${slug}.html`,`insights/${slug}/index.html`]){try{await readFile('public',legacy);return error(409,'That URL already belongs to an existing HTML article')}catch(e){if(e.status!==404)throw e}}}
 // Prevent cross-repository slug collisions and accidental destination overwrites.
 if(!x.originalSlug){const other=location(status==='draft'?'published':'draft',slug);try{await readFile(other.kind,other.path);return error(409,'This URL slug is already used by another article')}catch(e){if(e.status!==404)throw e}}
 if(sha&&previousStatus&&previousStatus!==status)return error(409,'The destination already has a post with this slug');
 // Never overwrite an existing post with a new post that has the same slug.
 if(sha&&!x.originalSlug)return error(409,'This URL slug is already used');
 await writeFile(l.kind,l.path,contentOf(p),`${sha?'Update':'Add'} blog post: ${slug}`,sha);
 if(previousStatus&&previousStatus!==status){const old=location(previousStatus,slug);try{const prior=await readFile(old.kind,old.path);await deleteFile(old.kind,old.path,`Move blog post: ${slug}`,prior.sha)}catch(e){if(e.status!==404)throw e}}
 return Response.json({slug,status})
 }
 if(req.method==='DELETE'){
 const x=await req.json();if(!slugOk(x.slug)||!['draft','published'].includes(x.status))return error(400,'Invalid article identifier');
 const l=location(x.status,x.slug);const existing=await readFile(l.kind,l.path);await deleteFile(l.kind,l.path,`Archive blog post: ${x.slug}`,existing.sha);return Response.json({archived:true})
 }
 return error(405,'Method not allowed')
 }catch(e){return safeError(e)}}
