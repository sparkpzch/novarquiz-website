// Real request handlers and RTDB transactions; isolated Auth, SQL and GCS
// adapters. No real identities, production database or storage are used.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import admin from 'firebase-admin';
const emulator=process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if(!emulator || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator))throw new Error('Use a local RTDB emulator.');
const app=admin.initializeApp({projectId:'demo-novarquiz',databaseURL:'https://demo-novarquiz-default-rtdb.firebaseio.com'},'security-api-qa');
const db=admin.database(app), uid='qa-security-owner', quizId='33333333-3333-4333-8333-333333333333', draftId='44444444-4444-4444-8444-444444444444', roomId='qa-security-team';
const authTime=Math.floor(Date.now()/1000)-100;
const state=globalThis.__securityQA={db,uid,quizId,files:new Map(),jobs:new Map(),cookie:null,savedFiles:0,customTokens:0,accountReads:0,
  account:{uid,disabled:false,customClaims:{admin:false},tokensValidAfterTime:new Date((authTime-10)*1000).toISOString()},
  decoded:{uid,auth_time:authTime,email_verified:true,firebase:{sign_in_provider:'password'}},
};
process.env.SESSION_SECRET='isolated-security-qa-secret';process.env.VIDEO_PROCESSING_JOB='qa-only';
const shims={
  'next/server':`export class NextResponse extends Response {static json(data,options){return Response.json(data,options);}} export const after=()=>{};`,
  'next/headers':`export const cookies=async()=>({get:()=>globalThis.__securityQA.cookie?{value:globalThis.__securityQA.cookie}:undefined,set:(_name,value)=>{globalThis.__securityQA.cookie=value;},delete:()=>{globalThis.__securityQA.cookie=null;}});`,
  '@/lib/firebase/admin':`const state=globalThis.__securityQA;
    export const adminRtdb=state.db;
    export const adminAuth={getUser:async()=>{state.accountReads++;if(state.unavailable)throw new Error('Account unavailable');return state.account;},verifyIdToken:async()=>state.decoded,createCustomToken:async(_uid,claims)=>{state.customTokens++;return JSON.stringify(claims);}};
    export const adminStorage={bucket:()=>({name:'qa-bucket',getFiles:async()=>[[{metadata:{size:'1024'}},{metadata:{size:'2048'}}]],file:path=>({
      save:async(bytes,options)=>{state.savedFiles++;state.files.set(path,{size:bytes.length,generation:'1',...options.metadata});},
      makePublic:async()=>{},
      createResumableUpload:async options=>{state.files.set(path,{size:options.metadata.contentLength,generation:'1',...options.metadata});return ['https://storage.googleapis.com/isolated-qa-session'];},
      getMetadata:async()=>[state.files.get(path)],
      download:async()=>[Buffer.from([0,0,0,24,102,116,121,112,105,115,111,109])],
      delete:async()=>{state.files.delete(path);},
    })})};`,
  '@/lib/db/postgres': `export default {query:async()=>({rowCount:0,rows:[]})};`,
  '@/lib/db/queries':`export const getQuizById=async id=>id===globalThis.__securityQA.quizId?{id,created_by:globalThis.__securityQA.uid,is_published:true}:null;
    export const syncUserProfile=async()=>{};`,
  '@/lib/video/jobs':`const state=globalThis.__securityQA;export const createVideoJob=async(owner,path,generation,id)=>{const job={id,owner_uid:owner,source_path:path,status:'queued'};state.jobs.set(id,job);return job;};export const getVideoJob=async id=>state.jobs.get(id);export const dispatchVideoJob=async()=>{};export const videoJobResult=job=>({id:job.id,status:job.status,path:job.source_path});`,
  '@/lib/ratelimit':`export const checkRateLimit=async()=>({allowed:true});`,
};
const entries={auth:'lib/auth.ts',session:'app/api/auth/session/route.ts',rehydrate:'app/api/auth/rehydrate/route.ts',upload:'app/api/upload/route.ts',video:'app/api/upload/video/route.ts',job:'app/api/video-processing/[jobId]/route.ts',team:'app/api/team-rooms/[roomId]/route.ts',join:'app/api/team-rooms/[roomId]/join/route.ts'};
const temp=await mkdtemp(path.join(tmpdir(),'novarquiz-security-'));
const plugin={name:'isolated-security-adapters',setup(build){build.onResolve({filter:/.*/},args=>shims[args.path]?{path:args.path,namespace:'qa'}:undefined);build.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:shims[args.path],loader:'js'}));}};
let count=0;
const check=async(label,work)=>{await work();count++;console.log('PASS '+label);};
try {
  await build({entryPoints:entries,outdir:temp,bundle:true,platform:'node',format:'esm',plugins:[plugin],logLevel:'silent'});
  const routes=Object.fromEntries(await Promise.all(Object.keys(entries).map(async key=>[key,await import(path.join(temp,key+'.js'))])));
  // Read the rollout version from source rather than duplicating a deployed constant.
  const {readFile}=await import('node:fs/promises');
  const source=await readFile('lib/security/session.ts','utf8');
  const sessionVersion=/SESSION_VERSION = '([^']+)'/.exec(source)[1];
  const mint=async(isAdmin=false)=>{state.cookie=await new SignJWT({uid,isAdmin,authTime,userSessionVersion:'0',sessionVersion}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('60s').sign(new TextEncoder().encode(process.env.SESSION_SECRET));};
  const request=body=>new Request('http://localhost/api/security-qa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const uploadRequest=(scope={quizId})=>{const form=new FormData();form.set('file',new File([png],'qa.png',{type:'image/png'}));for(const [key,value]of Object.entries(scope))form.set(key,value);return new Request('http://localhost/api/upload',{method:'POST',headers:scope.quizId?{'X-Quiz-Id':scope.quizId}:{'X-Upload-Draft-Id':scope.draftId},body:form});};
  const context={params:Promise.resolve({roomId})};
  await mint(true);
  state.account.customClaims.admin=true;
  await check('Admin cookie loses permission on the very next request after live claim removal',async()=>{
    assert.equal((await routes.auth.getSessionUser()).isAdmin,true);
    const reads=state.accountReads;state.account.customClaims.admin=false;
    assert.equal((await routes.auth.getSessionUser()).isAdmin,false);assert.equal(state.accountReads,reads+1);
    assert.equal((await routes.upload.POST(uploadRequest({draftId}))).status,403);assert.equal(state.savedFiles,0);
  });
  await check('Disabled or unavailable accounts cannot use an otherwise valid app cookie',async()=>{
    state.account.disabled=true;assert.equal(await routes.auth.getSessionUser(),null);
    assert.equal((await routes.upload.POST(uploadRequest())).status,401);
    state.account.disabled=false;state.unavailable=true;assert.equal(await routes.auth.getSessionUser(),null);state.unavailable=false;
  });
  await check('Firebase revokeRefreshTokens and per-account version changes invalidate the app cookie',async()=>{
    state.account.tokensValidAfterTime=new Date((authTime+1)*1000).toISOString();assert.equal(await routes.auth.getSessionUser(),null);
    state.account.tokensValidAfterTime=new Date((authTime-1)*1000).toISOString();state.account.customClaims.applicationSessionVersion=1;assert.equal(await routes.auth.getSessionUser(),null);delete state.account.customClaims.applicationSessionVersion;
  });
  await check('Rehydrate and a pre-revocation custom token cannot revive a revoked app session',async()=>{
    state.account.tokensValidAfterTime=new Date((authTime+1)*1000).toISOString();
    assert.equal((await routes.rehydrate.POST(request({}))).status,401);assert.equal(state.customTokens,0);
    await mint();state.decoded={uid,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'custom'},applicationAuthTime:authTime,applicationSessionVersion:'0'};
    assert.equal((await routes.session.POST(request({idToken:'qa-custom'}))).status,401);
    state.account.tokensValidAfterTime=new Date((authTime-1)*1000).toISOString();state.decoded={uid,auth_time:authTime,email_verified:true,firebase:{sign_in_provider:'password'}};await mint();
  });
  await check('Normal users cannot upload to another quiz or invent an admin draft',async()=>{
    assert.equal((await routes.upload.POST(uploadRequest({quizId:draftId}))).status,403);
    assert.equal((await routes.upload.POST(uploadRequest({draftId}))).status,403);assert.equal(state.savedFiles,0);
    assert.equal((await routes.video.POST(request({action:'init',size:12,type:'video/mp4',quizId:draftId}))).status,403);assert.equal(state.jobs.size,0);
  });
  await check('Authorized quiz owner can upload an image with a server-bound scope and quota reservation',async()=>{
    const response=await routes.upload.POST(uploadRequest());assert.equal(response.status,200);
    const image=await response.json();assert.equal(state.files.get(image.path).metadata.upload_scope,'quiz:'+quizId);
    const quota=(await db.ref('uploadQuotas/'+uid).get()).val();assert.equal(quota.dailyFiles,1);assert.equal(quota.storageBytes,8);
  });
  await check('Concurrent video init requests cannot exceed the shared daily processing budget',async()=>{
    const responses=await Promise.all(Array.from({length:20},()=>routes.video.POST(request({action:'init',size:12,type:'video/mp4',quizId}))));
    assert.equal(responses.filter(response=>response.status===200).length,10);
    assert.equal(responses.filter(response=>response.status===429).length,10);
    const accepted=await responses.find(response=>response.status===200).json();state.acceptedVideo=accepted;
    assert.equal((await db.ref('uploadQuotas/'+uid+'/dailyVideoUploads').get()).val(),10);
    assert.equal((await db.ref('uploadQuotas/'+uid+'/dailyVideoJobs').get()).val(),0);
  });
  await check('Video finish verifies its reservation and queues one job across concurrent requests',async()=>{
    const video=state.acceptedVideo;
    const responses=await Promise.all([routes.video.POST(request({action:'finish',id:video.id,ext:video.ext,quizId})),routes.video.POST(request({action:'finish',id:video.id,ext:video.ext,quizId}))]);
    assert.ok(responses.some(response=>response.status===202));assert.equal(state.jobs.size,1);
    assert.equal((await db.ref('uploadQuotas/'+uid+'/dailyVideoJobs').get()).val(),1);
  });
  await check('Completed video credits actual output size once across concurrent status polls',async()=>{
    const id=state.acceptedVideo.id,job=state.jobs.get(id);job.status='ready';job.output_path=`question-sessions/processed/${id}/master.m3u8`;
    const before=(await db.ref('uploadQuotas/'+uid+'/storageBytes').get()).val();
    const context={params:Promise.resolve({jobId:id})};
    const responses=await Promise.all([routes.job.GET(new Request('http://localhost'),context),routes.job.GET(new Request('http://localhost'),context)]);
    assert.equal(responses[0].status,200);assert.equal(responses[1].status,200);
    const after=(await db.ref('uploadQuotas/'+uid+'/storageBytes').get()).val();
    assert.equal(before-after,150*1024*1024-3072);
    await routes.job.GET(new Request('http://localhost'),context);
    assert.equal((await db.ref('uploadQuotas/'+uid+'/storageBytes').get()).val(),after);
  });
  await db.ref('teamRooms/'+roomId).set({hostId:'qa-team-host',sessionId:quizId,status:'waiting',pin:'123456',joinAttempts:{},players:{'qa-team-host':{displayName:'Host',joinedAt:Date.now()}}});
  await check('Legacy PIN is moved to server-only storage and non-member summary contains no PIN or roster',async()=>{
    const response=await routes.team.GET(new Request('http://localhost'),context);assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.pin,undefined);assert.equal(body.players,undefined);
    assert.equal((await db.ref('teamRooms/'+roomId+'/pin').get()).exists(),false);assert.equal((await db.ref('teamRoomSecrets/'+roomId+'/pin').get()).val(),'123456');
  });
  await check('Concurrent wrong PIN submissions spend exactly the five-attempt budget',async()=>{
    const responses=await Promise.all(Array.from({length:12},()=>routes.join.POST(request({pin:'654321'}),context)));
    assert.equal(responses.filter(response=>response.status===403).length,5);assert.equal(responses.filter(response=>response.status===429).length,7);
    assert.equal((await db.ref('teamRooms/'+roomId+'/players/'+uid).get()).exists(),false);
  });
  await db.ref('teamRoomSecrets/'+roomId+'/joinAttempts/'+uid).remove();
  await check('A correct PIN admits membership through the server and members still never receive the PIN',async()=>{
    assert.equal((await routes.join.POST(request({pin:'123456',displayName:'QA'}),context)).status,200);
    const summary=await(await routes.team.GET(new Request('http://localhost'),context)).json();assert.equal(summary.pin,undefined);assert.ok(summary.players[uid]);
  });
  console.log(count+' security API scenarios passed (real RTDB; Auth/SQL/GCS adapters).');
} finally {
  await db.ref().update({['uploadQuotas/'+uid]:null,['teamRooms/'+roomId]:null,['teamRoomSecrets/'+roomId]:null});
  const reservations=(await db.ref('uploadReservations').get()).val()??{};
  await Promise.all(Object.entries(reservations).filter(([,reservation])=>reservation.uid===uid).map(([id])=>db.ref('uploadReservations/'+id).remove()));
  await app.delete();await rm(temp,{recursive:true,force:true});
}
