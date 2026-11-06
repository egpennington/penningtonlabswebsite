import {initializeApp,cert,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
export function error(status,message){return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}})}
export async function requireAdmin(request){
 const match=/^Bearer (.+)$/i.exec(request.headers.get('authorization')||'');
 if(!match)throw {status:401,message:'Sign in required'};
 const {FIREBASE_PROJECT_ID,FIREBASE_CLIENT_EMAIL,FIREBASE_PRIVATE_KEY,ADMIN_UID}=process.env;
 if(!FIREBASE_PROJECT_ID||!FIREBASE_CLIENT_EMAIL||!FIREBASE_PRIVATE_KEY||!ADMIN_UID)throw {status:503,message:'Admin authentication is not configured'};
 if(!getApps().length)initializeApp({credential:cert({projectId:FIREBASE_PROJECT_ID,clientEmail:FIREBASE_CLIENT_EMAIL,privateKey:FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})});
 let decoded;try{decoded=await getAuth().verifyIdToken(match[1],true)}catch{throw {status:401,message:'Invalid or expired login'}}
 if(decoded.uid!==ADMIN_UID)throw {status:403,message:'This account is not authorized'};
 return decoded;
}
export const safeError=e=>error(e?.status&&Number.isInteger(e.status)?e.status:500,e?.status?e.message:'Server request failed');
