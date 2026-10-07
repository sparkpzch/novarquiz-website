// Real Firebase Auth account state + real application-cookie verification.
// Only next/headers is adapted to provide an isolated signed test cookie.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { SignJWT } from 'jose';
const endpoint=process.env.FIREBASE_AUTH_EMULATOR_HOST;
if(!endpoint || !/^(127\.0\.0\.1|localhost):\d+$/.test(endpoint))throw new Error('Use the local Firebase Auth emulator.');
const projectId='demo-novarquiz',uid='qa-live-auth-account',email='qa-live-auth@example.invalid',password='Isolated-QA-password-123';
const app=admin.initializeApp({projectId},'live-auth-qa'),adminAuth=admin.auth(app);
const clientApp=initializeApp({projectId,apiKey:'fake-api-key'},'live-auth-client'),auth=getAuth(clientApp);
connectAuthEmulator(auth,`http://${endpoint}`,{disableWarnings:true});
process.env.SESSION_SECRET='local-auth-emulator-session-secret';
const state=globalThis.__authQA={cookie:null,adminAuth};
const temp=await mkdtemp(path.join(tmpdir(),'novarquiz-live-auth-'));
const shims={
  'next/headers':`export const cookies=async()=>({get:()=>({value:globalThis.__authQA.cookie})});`,
  '@/lib/firebase/admin':`export const adminAuth=globalThis.__authQA.adminAuth;`,
};
const plugin={name:'auth-request-context',setup(build){build.onResolve({filter:/.*/},args=>shims[args.path]?{path:args.path,namespace:'qa'}:undefined);build.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:shims[args.path],loader:'js'}));}};
try{
  await adminAuth.createUser({uid,email,password,emailVerified:true});
  await adminAuth.setCustomUserClaims(uid,{admin:true});
  await build({entryPoints:['lib/auth.ts'],outfile:path.join(temp,'auth.mjs'),bundle:true,format:'esm',platform:'node',plugins:[plugin],logLevel:'silent'});
  const {getSessionUser,getVerifiedFirebaseIdentity}=await import(path.join(temp,'auth.mjs'));
  const source=await readFile('lib/security/session.ts','utf8'),sessionVersion=/SESSION_VERSION = '([^']+)'/.exec(source)[1];
  const mint=async()=>{
    const credential=await signInWithEmailAndPassword(auth,email,password);
    const decoded=await adminAuth.verifyIdToken(await credential.user.getIdToken(),true);
    state.cookie=await new SignJWT({uid,isAdmin:true,authTime:decoded.auth_time,userSessionVersion:'0',sessionVersion}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('60s').sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  };
  await mint();
  const original=await adminAuth.verifyIdToken(await auth.currentUser.getIdToken(),true);
  const recovery=await adminAuth.createCustomToken(uid,{applicationAuthTime:original.auth_time,applicationSessionVersion:'0'});
  assert.equal((await getSessionUser()).isAdmin,true);
  console.log('PASS signed application cookie authenticates a real emulated Firebase account');
  await adminAuth.setCustomUserClaims(uid,{admin:false});
  assert.equal((await getSessionUser()).isAdmin,false);
  console.log('PASS live admin removal takes effect without refreshing or replacing the app cookie');
  await adminAuth.updateUser(uid,{disabled:true});assert.equal(await getSessionUser(),null);
  console.log('PASS disabled account immediately loses application-session access');
  await adminAuth.updateUser(uid,{disabled:false});
  await new Promise(resolve=>setTimeout(resolve,1100));
  await adminAuth.revokeRefreshTokens(uid);assert.equal(await getSessionUser(),null);
  console.log('PASS real Firebase refresh-token revocation invalidates the app cookie');
  const recovered=await signInWithCustomToken(auth,recovery);
  await assert.rejects(getVerifiedFirebaseIdentity(await recovered.user.getIdToken()),/revoked/);
  console.log('PASS pre-revocation custom-token recovery cannot revive application access');
  await mint();assert.ok(await getSessionUser());
  await adminAuth.setCustomUserClaims(uid,{admin:false,applicationSessionVersion:1});assert.equal(await getSessionUser(),null);
  console.log('PASS per-user version bump invalidates an unexpired cookie');
  await adminAuth.deleteUser(uid);assert.equal(await getSessionUser(),null);
  console.log('PASS deleted account cannot use the old app cookie');
  console.log('7 real Firebase Auth integration scenarios passed.');
}finally{
  await signOut(auth).catch(()=>{});await deleteApp(clientApp);await adminAuth.deleteUser(uid).catch(()=>{});await app.delete();await rm(temp,{recursive:true,force:true});
}
