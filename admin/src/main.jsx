import React from 'react';
import {createRoot} from 'react-dom/client';
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import {auth,configured} from './firebase';
import './styles.css';

function slugify(s){return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)}
const blank=()=>({title:'',slug:'',category:'Development Notes',date:new Date().toISOString().slice(0,10),excerpt:'',body:'',featuredImage:'',status:'draft',originalSlug:''});
const api=async(user,method='GET',path='',body)=>{
 const token=await user.getIdToken();
 const res=await fetch('/.netlify/functions/'+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 let result;try{result=await res.json()}catch{result={error:'Invalid server response'}}
 if(!res.ok)throw new Error(result.error||`Request failed (${res.status})`);
 return result;
};

// Image metadata is stored in standard Markdown's optional title field.
// Example: ![Diagram](/assets/blog/diagram.png "pl:size=small;caption=My%20diagram")
const imageSizes=['small','medium','large'];
function encodeImageMarkdown({alt,url,size='medium',caption=''}){
 const cleanAlt=String(alt||'Image').replace(/[\[\]\r\n]/g,' ').trim();
 const cleanUrl=String(url||'').trim();
 if(!cleanUrl||/[\s()"<>]/.test(cleanUrl))throw Error('Please provide a valid image URL without spaces');
 const metadata=`pl:size=${imageSizes.includes(size)?size:'medium'};caption=${encodeURIComponent(caption||'')}`;
 return `![${cleanAlt}](${cleanUrl} "${metadata}")`;
}
function decodeImageTitle(title=''){
 const match=String(title).match(/^pl:size=(small|medium|large);caption=(.*)$/);
 if(!match)return {size:'medium',caption:''};
 let caption='';try{caption=decodeURIComponent(match[2])}catch{}
 return {size:match[1],caption};
}
function escHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatImages(html){
 return String(html).replace(/<img\b[^>]*>/gi,tag=>{
  const match=tag.match(/\btitle="pl:size=(small|medium|large);caption=([^"<>]*)"/i);
  if(!match)return tag;
  const {size,caption}=decodeImageTitle(`pl:size=${match[1]};caption=${match[2].replace(/&amp;/g,'&')}`);
  const cleanTag=tag.replace(/\s+title="[^"]*"/i,'');
  return `<figure class="blog-figure size-${size}">${cleanTag}${caption?`<figcaption>${escHtml(caption)}</figcaption>`:''}</figure>`;
 }).replace(/<p>\s*(<figure class="blog-figure[\s\S]*?<\/figure>)\s*<\/p>/gi,'$1');
}
function findImageAtCursor(body,start,end){
 const pattern=/!\[([^\]\n]*)\]\(([^\s()]+)(?:\s+"([^"]*)")?\)/g;
 for(const m of body.matchAll(pattern)){
  const a=m.index,b=a+m[0].length;
  if((start>=a&&start<=b)||(start<=a&&end>=b)){
   return {start:a,end:b,alt:m[1],url:m[2],...decodeImageTitle(m[3])};
  }
 }
 return null;
}

function App(){
 const [user,setUser]=React.useState(undefined),[email,setEmail]=React.useState(''),[password,setPassword]=React.useState(''),[loginError,setLoginError]=React.useState('');
 const [view,setView]=React.useState('dashboard'),[posts,setPosts]=React.useState([]),[form,setForm]=React.useState(blank()),[baseline,setBaseline]=React.useState(''),[selected,setSelected]=React.useState(null),[filter,setFilter]=React.useState(''),[mode,setMode]=React.useState('write'),[busy,setBusy]=React.useState(false),[notice,setNotice]=React.useState(''),[error,setError]=React.useState('');
 const textareaRef=React.useRef(null);
 const imageRange=React.useRef(null);
 const [imageOpen,setImageOpen]=React.useState(false);
 const [imageFile,setImageFile]=React.useState(null);
 const [imageDetails,setImageDetails]=React.useState({alt:'',url:'',size:'medium',caption:''});
 React.useEffect(()=>configured?onAuthStateChanged(auth,u=>setUser(u)):undefined,[]);
 const dirty=view==='editor'&&JSON.stringify(form)!==baseline;
 React.useEffect(()=>{const fn=e=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn)},[dirty]);
 const run=async(fn)=>{setBusy(true);setError('');setNotice('');try{await fn()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const load=()=>run(async()=>{try{const d=await api(user,'GET','posts');setPosts(d.posts||[])}catch(e){if(/not authorized/i.test(e.message)){await signOut(auth);setLoginError('This account is not authorized for the Control Center.');return}throw e}});
 React.useEffect(()=>{if(user)load()},[user]);
 const navigate=(name)=>{if(dirty&&!confirm('Discard unsaved changes?'))return;setView(name);setNotice('');setError('')};
 const newPost=()=>{if(dirty&&!confirm('Discard unsaved changes?'))return;const p=blank();setForm(p);setBaseline(JSON.stringify(p));setSelected(null);setMode('write');setView('editor');setError('')};
 const editPost=(p)=>run(async()=>{if(dirty&&!confirm('Discard unsaved changes?'))return;const d=await api(user,'GET','posts?slug='+encodeURIComponent(p.slug)+'&status='+encodeURIComponent(p.status));const loaded={...blank(),...d.post,originalSlug:p.slug};setForm(loaded);setBaseline(JSON.stringify(loaded));setSelected(p);setMode('write');setView('editor')});
 const field=(name,value)=>setForm(p=>({...p,[name]:value,...(name==='title'&&!p.originalSlug?{slug:slugify(value)}:{})}));
 const save=(status)=>run(async()=>{if(!form.title.trim()||!form.slug.trim())throw Error('Enter a title and URL slug');const data={...form,status,previousStatus:selected?.status||null};const result=await api(user,'POST','posts',data);const updated={...data,originalSlug:result.slug||data.slug};setForm(updated);setBaseline(JSON.stringify(updated));setSelected({slug:updated.slug,status});setNotice(status==='published'?'Published to GitHub. Netlify will deploy the article shortly.':'Draft saved in the private draft repository.');const d=await api(user,'GET','posts');setPosts(d.posts||[])});
  const deletePost=(p)=>{
    if(!p||busy)return;
    const title=p.title||p.slug;
    const location=p.status==='draft'?'private drafts repository':'website repository';
    const phrase=prompt(`Delete “${title}” from the ${location}?\n\nType DELETE to confirm. Git history retains earlier versions.`);
    if(phrase!=='DELETE')return;
    run(async()=>{
      await api(user,'DELETE','posts',{slug:p.slug,status:p.status});
      const d=await api(user,'GET','posts');
      setPosts(d.posts||[]);
      if(view==='editor'&&selected?.slug===p.slug){
        const b=blank();setForm(b);setBaseline(JSON.stringify(b));setSelected(null);setView('posts');
      }
      setNotice('Article deleted from its repository. Git history retains earlier versions.');
    });
  };
  const remove=()=>{if(selected)deletePost({...selected,title:form.title})};
 const insert=(before,after='')=>{const el=textareaRef.current;const start=el?.selectionStart??form.body.length,end=el?.selectionEnd??start,txt=form.body;const selectedTxt=txt.slice(start,end);field('body',txt.slice(0,start)+before+selectedTxt+after+txt.slice(end));setTimeout(()=>{el?.focus();el?.setSelectionRange(start+before.length,start+before.length+selectedTxt.length)},0)};
 const openImageEditor=()=>{
  const el=textareaRef.current,start=el?.selectionStart??form.body.length,end=el?.selectionEnd??start;
  const found=findImageAtCursor(form.body,start,end);
  imageRange.current=found?{start:found.start,end:found.end}:{start,end};
  setImageDetails(found?{alt:found.alt,url:found.url,size:found.size,caption:found.caption}:{alt:'',url:'',size:'medium',caption:''});
  setImageFile(null);setImageOpen(true);
 };
 const applyImage=()=>run(async()=>{
  let url=imageDetails.url;
  if(imageFile){
   if(!/^image\/(png|jpeg|webp|gif)$/.test(imageFile.type)||imageFile.size>4*1024*1024)throw Error('Use a PNG, JPEG, WebP or GIF under 4 MB');
   const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(imageFile)});
   const d=await api(user,'POST','media',{filename:imageFile.name,base64,mime:imageFile.type});url=d.url;
  }
  const markdown=encodeImageMarkdown({...imageDetails,url,alt:imageDetails.alt||imageFile?.name.replace(/\.[^.]+$/,'')||'Image'});
  const range=imageRange.current||{start:form.body.length,end:form.body.length};
  const prefix=form.body.slice(0,range.start),suffix=form.body.slice(range.end);
  const isEdit=range.end>range.start;
  field('body',prefix+(isEdit?markdown:`\n\n${markdown}\n\n`)+suffix);
  setImageOpen(false);setImageFile(null);setNotice('Image inserted. Save the article to preserve your changes.');
 });

 const visible=posts.filter(p=>(p.title+' '+p.category+' '+p.status).toLowerCase().includes(filter.toLowerCase()));
 if(!configured)return <div className="center"><div className="login"><strong className="brand">PL <span>Control Center</span></strong><h1>Setup required</h1><p>Configure the four VITE_FIREBASE_* settings in Netlify before admin login can work.</p><a href="/">← Return to site</a></div></div>;
 if(user===undefined)return <div className="center">Loading authentication…</div>;
 if(!user)return <div className="center"><form className="login" onSubmit={e=>{e.preventDefault();setLoginError('');signInWithEmailAndPassword(auth,email,password).catch(err=>setLoginError('Sign in failed. Check your credentials.'))}}><div className="brand">PL <span>Pennington Labs</span></div><p className="eyebrow">Private control center</p><h1>Admin sign in</h1><label>Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{loginError&&<p className="error" role="alert">{loginError}</p>}<button type="submit">Sign in</button><a href="/">← Back to website</a></form></div>;
 return <div className="shell"><aside><div className="brand">PL <span>Control Center</span></div><div className="aside-caption">PENNINGTON LABS</div><nav aria-label="Admin navigation"><button className={view==='dashboard'?'active':''} onClick={()=>navigate('dashboard')}>⌂ Dashboard</button><button className={view==='posts'?'active':''} onClick={()=>{navigate('posts');load()}}>▤ Blog Posts</button><button className={view==='editor'?'active':''} onClick={newPost}>＋ New Article</button></nav><div className="aside-bottom"><a href="/" target="_blank" rel="noreferrer">↗ View Website</a><button className="ghost" onClick={()=>signOut(auth)}>Sign Out</button></div></aside><div className="workspace"><header className="top"><span>Pennington Labs / {view==='editor'?'Article Editor':view==='posts'?'Blog Posts':'Dashboard'}</span><span className="user">Signed in · {user.email}</span></header><main className="content">{notice&&<div className="notice" role="status">{notice}</div>}{error&&<div className="error" role="alert">{error}</div>}
 {view==='dashboard'&&<><div className="title-row"><div><p className="eyebrow">WELCOME BACK</p><h1>Blog Administration</h1><p>Write and manage your Pennington Labs insights.</p></div><button onClick={newPost}>＋ New Blog Post</button></div><div className="stats"><div className="stat"><strong>{posts.length}</strong><span>Total Posts</span></div><div className="stat"><strong>{posts.filter(p=>p.status==='published').length}</strong><span>Published</span></div><div className="stat"><strong>{posts.filter(p=>p.status==='draft').length}</strong><span>Drafts</span></div></div><h2>Recent posts</h2><PostTable posts={posts.slice(0,6)} onEdit={editPost} onDelete={deletePost} busy={busy} /><button className="secondary" onClick={()=>navigate('posts')}>Manage all posts →</button></>}
 {view==='posts'&&<><div className="title-row"><div><p className="eyebrow">CONTENT LIBRARY</p><h1>All Blog Posts</h1><p>Open a post to read or update it.</p></div><button onClick={newPost}>＋ New Blog Post</button></div><input aria-label="Search posts" placeholder="Search by title, category or status…" value={filter} onChange={e=>setFilter(e.target.value)}/><PostTable posts={visible} onEdit={editPost} onDelete={deletePost} busy={busy}/></>}
 {view==='editor'&&<><div className="title-row"><div><p className="eyebrow">{selected?'EDIT ARTICLE':'NEW ARTICLE'}</p><h1>{selected?'Edit Blog Post':'Create Blog Post'}</h1><p>{dirty?'● Unsaved changes':'All changes saved or no changes yet'}</p></div><div className="actions"><button className="secondary" disabled={busy} onClick={()=>save('draft')}>Save Draft</button><button disabled={busy} onClick={()=>save('published')}>Publish</button></div></div><div className="editor-grid"><div className="edit-main"><label>Article title<input value={form.title} onChange={e=>field('title',e.target.value)} placeholder="Enter your article title…"/></label><div className="two"><label>Category<select value={form.category} onChange={e=>field('category',e.target.value)}>{['Coding Productivity','Breakthrough Thinking','Development Notes','Reading & Reflections'].map(x=><option key={x}>{x}</option>)}</select></label><label>Date<input type="date" value={form.date} onChange={e=>field('date',e.target.value)}/></label></div><div className="tabs"><button className={mode==='write'?'active':''} onClick={()=>setMode('write')}>Write</button><button className={mode==='preview'?'active':''} onClick={()=>setMode('preview')}>Preview</button></div>{mode==='write'?<><div className="toolbar"><button title="Bold" onClick={()=>insert('**','**')}><b>B</b></button><button title="Italic" onClick={()=>insert('*','*')}><i>I</i></button><button title="Heading" onClick={()=>insert('\n## ')}>H2</button><button title="List" onClick={()=>insert('\n- ')}>☷</button><button title="Link" onClick={()=>insert('[','](https://example.com)')}>🔗</button><button title="Insert image or edit image at cursor" onClick={openImageEditor}>▧ Image</button></div><textarea ref={textareaRef} className="writer" spellCheck value={form.body} onChange={e=>field('body',e.target.value)} placeholder="## Your first heading\n\nStart writing…"/></>:<div className="preview"><h1>{form.title||'Untitled'}</h1><p className="meta">{form.category} · {form.date}</p><div dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(formatImages(marked.parse(form.body||'*Nothing to preview yet.*')))}}/></div>}<label>Summary (Insights card)<textarea rows="3" value={form.excerpt} onChange={e=>field('excerpt',e.target.value)} placeholder="One or two sentences describing this article"/></label></div><aside className="settings"><h3>Publish settings</h3><label>URL slug<input value={form.slug} onChange={e=>field('slug',slugify(e.target.value))} disabled={!!form.originalSlug}/></label><p className="hint">{form.originalSlug?'Published URL is locked to protect existing links.':'Generated from title; edit before first save.'}</p><p className="hint">/insights/{form.slug||'article-title'}/</p><label>Featured image URL (optional)<input value={form.featuredImage} onChange={e=>field('featuredImage',e.target.value)} placeholder="/assets/blog/photo.png"/></label><p className="hint">For inline images, place your cursor in the editor and click Image.</p><div className="stack"><button className="secondary" disabled={busy} onClick={()=>save('draft')}>Save Draft</button><button disabled={busy} onClick={()=>save('published')}>Publish / Update</button>{selected?.status==='published'&&<button className="secondary" disabled={busy} onClick={()=>save('draft')}>Unpublish</button>}{selected&&<button className="danger" disabled={busy} onClick={remove}>Delete Post</button>}</div></aside></div></>}

 {imageOpen&&<div className="image-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setImageOpen(false)}}><section className="image-modal" role="dialog" aria-modal="true" aria-labelledby="image-dialog-heading"><h2 id="image-dialog-heading">Insert / Edit Image</h2><p className="hint">Place the cursor inside an existing image's Markdown to change its size or caption.</p><label>Upload image (optional)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setImageFile(e.target.files?.[0]||null)}/></label><label>Image URL<input value={imageDetails.url} onChange={e=>setImageDetails(p=>({...p,url:e.target.value}))} placeholder="/assets/blog/diagram.png" /></label><label>Alt text<input value={imageDetails.alt} onChange={e=>setImageDetails(p=>({...p,alt:e.target.value}))} placeholder="Describe the image for screen readers" /></label><label>Image size<select value={imageDetails.size} onChange={e=>setImageDetails(p=>({...p,size:e.target.value}))}><option value="small">Small (360px)</option><option value="medium">Medium (720px)</option><option value="large">Large (full article width)</option></select></label><label>Caption (optional)<input value={imageDetails.caption} onChange={e=>setImageDetails(p=>({...p,caption:e.target.value}))} placeholder="Shown beneath the image" /></label><div className="image-modal-actions"><button className="secondary" onClick={()=>setImageOpen(false)} disabled={busy}>Cancel</button><button onClick={applyImage} disabled={busy||(!imageFile&&!imageDetails.url.trim())}>{busy?'Working…':'Insert / Update Image'}</button></div></section></div>}
 </main></div></div>;
}
function PostTable({posts,onEdit,onDelete,busy}){
  return <div className="table-wrap"><table>
    <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
    <tbody>{posts.map(p=><tr key={p.status+':'+p.slug}>
      <td><strong>{p.title}</strong></td><td>{p.category}</td>
      <td><span className={'status '+p.status}>{p.status}</span></td><td>{p.date}</td>
      <td><div style={{display:'flex',gap:'8px',alignItems:'center'}}>
        <button className="secondary mini" disabled={busy} onClick={()=>onEdit(p)}>Edit</button>
        <button className="danger mini" disabled={busy} onClick={()=>onDelete(p)} aria-label={'Delete '+p.title}>Delete</button>
      </div></td>
    </tr>)}{!posts.length&&<tr><td colSpan="5">No posts yet. Create your first article!</td></tr>}</tbody>
  </table></div>
}
createRoot(document.getElementById('root')).render(<App/>);
