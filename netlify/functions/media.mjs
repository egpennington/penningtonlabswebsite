import {requireAdmin,safeError,error} from '../../lib/server-auth.mjs';
import {writeFile} from '../../lib/github.mjs';
export default async function handler(req){try{
 await requireAdmin(req);
 if(req.method!=='POST')return error(405,'Method not allowed');
 const {filename,base64,mime}=await req.json();
 const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
 if(!types[mime]||typeof base64!=='string'||base64.length>5_600_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return error(400,'Invalid image. Use PNG, JPEG, WebP or GIF under 4 MB');
 const bytes=Buffer.from(base64,'base64');if(bytes.length>4*1024*1024)return error(413,'Image too large');
 const valid=mime==='image/png'?bytes.subarray(0,4).equals(Buffer.from([137,80,78,71])):mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):mime==='image/gif'?bytes.subarray(0,3).toString()==='GIF':bytes.subarray(0,4).toString()==='RIFF';
 if(!valid)return error(400,'Image content does not match its type');
 const safe=String(filename||'image').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').slice(0,48)||'image';
 const unique=crypto.randomUUID().slice(0,12);const name=`${safe}-${unique}.${types[mime]}`;
 const path=`assets/blog/${name}`;
 await writeFile('public',path,bytes,`Upload blog image: ${name}`);
 return Response.json({url:`/${path}`});
 }catch(e){return safeError(e)}}
