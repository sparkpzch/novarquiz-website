// Isolated route integration checks: real RTDB emulator, in-memory SQL/auth
// adapters. Never connects to production services or uses real accounts.
import { build } from 'esbuild';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { createServer } from 'node:http';

const emulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!emulator || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) throw new Error('Set FIREBASE_DATABASE_EMULATOR_HOST to a local emulator.');
const projectId = 'demo-novarquiz';
const app = admin.initializeApp({ projectId, databaseURL: `https://${projectId}-default-rtdb.firebaseio.com` }, 'lobby-qa');
const database = admin.database(app);
const sessionId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const session = { id: sessionId, user_id: 'qa-host', name: 'Lobby QA', is_private: true, status: 'opened' };
const progress = new Map();
const locks = new Map();
globalThis.__lobbyQA = {
  session, progress, database, answerWrites:0, completionWrites:0, completed:new Map(),
  async lock(id, uid, work) {
    const key = `${id}:${uid}`, previous = locks.get(key) ?? Promise.resolve();
    let release; const next = new Promise(resolve => { release = resolve; });
    locks.set(key, previous.then(() => next));
    await previous;
    try { return await work(); } finally { release(); }
  },
  question: { id: questionId, question_order: 0, question_text: 'Test question', node_type: 'normal', choices: [{ id: 'choice', label: 'A', choice_text: 'Test answer' }] },
};
process.env.SESSION_SECRET = 'isolated-lobby-qa-secret';
const temp = await mkdtemp(path.join(tmpdir(), 'novarquiz-lobby-routes-'));
const shims = {
  '@/lib/firebase/admin': `export const adminRtdb = globalThis.__lobbyQA.database;
    export const adminAuth = { getUser: async uid => ({ uid, displayName: 'Jordan Lee', photoURL: null }) };`,
  '@/lib/play-auth': `export async function getPlayUser(request) { const uid = request.headers.get('X-QA-User'); return uid ? {uid, isAdmin:false, isGuest:false} : null; }`,
  '@/lib/ratelimit': `export const checkRateLimit = async () => ({allowed:true});`,
  '@/lib/auth': `export async function getSessionUser() { return {uid:'qa-player', isAdmin:true}; }`,
  '@/lib/db/queries': `const state = globalThis.__lobbyQA;
    export const getSessionById = async id => id === state.session.id ? state.session : null;
    export const getSessionByToken = async token => token === state.session.id ? state.session : null;
    export const withPlayerAnswerLock = (id, uid, work) => state.lock(id, uid, work);
    export const updateSession = async (_id, changes) => Object.assign(state.session, changes);
    export const getEntryQuestion = async () => state.question;
    export const getQuestionById = async () => state.question;
    export const resolveSessionToQuizId = async () => 'quiz';
    export const getQuizById = async () => ({id:'quiz', is_published:true, shuffle_choices:false});
    export const getQuizForQuestion = async () => ({quiz_id:'quiz', is_published:true});
    export const getAttemptBoundary = async (id, uid) => state.progress.get(uid)?.attempt_boundary ?? 'first';
    export const getNextQuestion = async () => null;
    export const getExistingAnswer = async (_id,uid) => state.progress.get(uid)?.answer ?? null;
    export const getUserCumulativeScore = async (_id, uid) => state.progress.get(uid)?.score ?? 0;
    export const saveUserAnswer = async () => {state.answerWrites++;return {id:'qa-answer',points_earned:5,explanation:'Test explanation'};};
    export const getOrCreateSession = async () => state.session;
    export const completeSession = async data => {state.completionWrites++;const result={total_score:state.progress.get(data.user_id).score,streak:1,total_time_ms:1000,is_me:true};state.completed.set(data.user_id,result);return result;};
    export const getLeaderboard = async (_id,uid) => state.completed.has(uid)?[state.completed.get(uid)]:[];
    export const getUserHistory = async () => [];
    export const getUserHistoryAnswers = async () => [];`,
  '@/lib/db/play-progress': `const state = globalThis.__lobbyQA;
    export const getProgress = async (_id, uid, boundary) => { const p = state.progress.get(uid); return p && (!boundary || p.attempt_boundary===boundary) ? p : null; };
    export const resetProgress = async (_id, uid) => { if(state.progress.get(uid)?.completed) state.progress.delete(uid); };
    export const startProgress = async (id, uid, boundary, question, deferStart=false) => {
      let p = state.progress.get(uid);
      if(!p || p.attempt_boundary!==boundary) { p={session_id:id,user_id:uid,attempt_boundary:boundary,question_id:question,question_started_at:deferStart?0:Date.now(),started_at:deferStart?0:Date.now(),score:0,streak:0,completed:false,updated_at:new Date().toISOString()}; state.progress.set(uid,p); }
      return p;
    };
    export const activateProgress = async (_id,uid,_boundary,question) => { const p=state.progress.get(uid);if(p.started_at===0){p.started_at=Date.now();p.question_started_at=Date.now();p.question_id=question;}return p; };
    export const answerProgress = async (_id,uid,_boundary,_question,answer) => {const p=state.progress.get(uid);if(!p.answer){p.score+=answer.points_earned;p.answer=answer;p.updated_at=new Date().toISOString();}return p;};
    export const advanceProgress = async () => null;
    export const completeProgress = async (_id,uid) => {state.progress.get(uid).completed=true;};`,
  '@/lib/ai/personal-recap': `export const preparePersonalRecap = async () => ({state:'unavailable'});`,
  '@/lib/db/query-context': `export const withDbSavepoint = work => work();`,
  'next/server': `export class NextResponse extends Response { static json(data, options) { return Response.json(data,options); } }
    export const after = callback => { globalThis.__lobbyQA.after = callback; };`,
};
const entries = {
  join: 'app/api/sessions/[sessionId]/join/route.ts',
  presence: 'app/api/play/[sessionId]/presence/route.ts',
  answer: 'app/api/play/[sessionId]/answer/route.ts',
  complete: 'app/api/play/[sessionId]/complete/route.ts',
  invitation: 'app/api/join/[token]/route.ts',
  host: 'app/api/admin/sessions/[sessionId]/lobby/route.ts',
};
const plugin = { name:'isolated-adapters', setup(build) {
  build.onResolve({ filter: /.*/ }, args => shims[args.path] ? {path:args.path,namespace:'qa'} : undefined);
  build.onLoad({filter:/.*/,namespace:'qa'}, args => ({contents:shims[args.path],loader:'js'}));
} };
await build({ entryPoints:entries, outdir:temp, bundle:true, platform:'node', format:'esm', plugins:[plugin], logLevel:'silent' });
const routes = Object.fromEntries(await Promise.all(Object.keys(entries).map(async key => [key, await import(path.join(temp, `${key}.js`))])));
const context = { params: Promise.resolve({sessionId}) };
const request = (method, body, token, suffix='') => {
  const headers = new Headers({'Content-Type':'application/json','X-QA-User':'qa-player'});
  if(token) headers.set('X-Lobby-Connection',token);
  const result = new Request(`http://localhost/api/play/${sessionId}${suffix}`, {method,headers,...(body ? {body:JSON.stringify(body)} : {})});
  result.nextUrl = new URL(result.url);
  return result;
};
const seed = async roundId => {
  await database.ref().set({ sessions:{ [sessionId]:{status:'waiting',hostId:'qa-host',joinToken:`invite-${roundId}`,roundId} }, joinTokens:{[`invite-${roundId}`]:{sessionId}} });
};
let count = 0;
const check = (label, callback) => callback().then(() => { count++; console.log(`PASS ${label}`); });
try {
  await seed('one');
  await check('Invitation lookup accepts the current token and refuses a private session ID', async () => {
    const lookup = token => routes.invitation.GET(request('GET'), {params:Promise.resolve({token})});
    assert.equal((await lookup('invite-one')).status,200);
    assert.equal((await lookup(sessionId)).status,404);
  });
  await check('Private join without QR/URL proof is refused', async () => assert.equal((await routes.join.POST(request('POST',{}),context)).status,403));
  const a = await (await routes.join.POST(request('POST',{invitationToken:'invite-one'}),context)).json();
  assert.ok(a.token, JSON.stringify(a));
  await check('Waiting in the lobby does not start the quiz or question timer',async()=>assert.equal(progress.get('qa-player').started_at,0));
  const firstProgress = progress.get('qa-player'); firstProgress.score=12;
  const b = await (await routes.join.POST(request('POST',{invitationToken:'invite-one'}),context)).json();
  await check('Latest join wins and preserves unfinished progress', async () => {
    const room = (await database.ref(`sessions/${sessionId}`).get()).val();
    assert.notEqual(a.connectionId,b.connectionId); assert.equal(room.players['qa-player'].connectionId,b.connectionId);
    assert.equal(room.scores['qa-player'].score,12); assert.equal(progress.get('qa-player'),firstProgress);
  });
  await check('Old device Leave does not remove the latest player or session index', async () => {
    assert.equal((await routes.presence.DELETE(request('DELETE',null,a.token),context)).status,200);
    assert.equal((await database.ref(`sessions/${sessionId}/players/qa-player/left`).get()).val(),null);
    assert.equal((await database.ref(`userSessions/qa-player/${sessionId}/connectionId`).get()).val(),b.connectionId);
  });
  await check('Old heartbeat/metadata cannot alter latest connection', async () => {
    assert.equal((await routes.presence.POST(request('POST',{currentQuestionLabel:'stale'},a.token),context)).status,409);
    assert.notEqual((await database.ref(`sessions/${sessionId}/scores/qa-player/currentQuestionLabel`).get()).val(),'stale');
  });
  await check('Question APIs refuse direct access and enforce host start', async () => {
    assert.equal((await routes.answer.GET(request('GET',null,null,'/answer?entry=true'),context)).status,409);
    assert.equal((await routes.answer.GET(request('GET',null,b.token,'/answer?entry=true'),context)).status,403);
    assert.equal((await routes.host.POST(request('POST',{action:'start'}),context)).status,200);
    assert.equal((await routes.answer.GET(request('GET',null,b.token,'/answer?entry=true'),context)).status,200);
    assert.ok(progress.get('qa-player').started_at>0);
    assert.equal((await routes.answer.GET(request('GET',null,a.token,'/answer?entry=true'),context)).status,409);
  });
  await check('Old answer and completion requests are refused before writes', async () => {
    const answer = {question_id:questionId,chosen_label:'A',question_token:'expired',time_taken_ms:100};
    assert.equal((await routes.answer.POST(request('POST',answer,a.token),context)).status,409);
    const complete = {final_question_id:questionId,final_question_token:'expired'};
    assert.equal((await routes.complete.POST(request('POST',complete,a.token),context)).status,409);
    assert.equal(progress.get('qa-player').score,12);
  });
  await check('Closing invalidates the invite and stops current gameplay', async () => {
    assert.equal((await routes.host.POST(request('POST',{action:'close'}),context)).status,200);
    assert.equal((await database.ref('joinTokens/invite-one').get()).exists(),false);
    assert.equal((await routes.answer.GET(request('GET',null,b.token,'/answer?entry=true'),context)).status,403);
    assert.equal((await routes.join.POST(request('POST',{invitationToken:'invite-one'}),context)).status,403);
  });
  await check('Expired invitation lookup cannot expose a closed private quiz', async () => {
    assert.equal((await routes.invitation.GET(request('GET'), {params:Promise.resolve({token:'invite-one'})})).status,404);
  });
  await seed('two');
  await check('New lobby round starts clean and old invitation cannot rejoin', async () => {
    assert.equal((await routes.join.POST(request('POST',{invitationToken:'invite-one'}),context)).status,403);
    const response = await routes.join.POST(request('POST',{invitationToken:'invite-two'}),context);
    assert.equal(response.status,200);
    assert.equal(progress.get('qa-player').score,0); assert.notEqual(progress.get('qa-player').attempt_boundary,firstProgress.attempt_boundary);
  });
  await check('Concurrent explicit joins serialize: one owner, one roster entry', async () => {
    const responses = await Promise.all([routes.join.POST(request('POST',{invitationToken:'invite-two'}),context),routes.join.POST(request('POST',{invitationToken:'invite-two'}),context)]);
    const [first,last] = await Promise.all(responses.map(response=>response.json()));
    const room = (await database.ref(`sessions/${sessionId}`).get()).val();
    assert.equal(Object.keys(room.players).length,1); assert.equal(room.players['qa-player'].connectionId,last.connectionId);
    assert.equal((await routes.presence.POST(request('POST',{},first.token),context)).status,409);
  });
  const latest = (await routes.join.POST(request('POST',{invitationToken:'invite-two'}),context)).json();
  const owner = await latest;
  assert.equal((await routes.host.POST(request('POST',{action:'start'}),context)).status,200);
  const entry = await (await routes.answer.GET(request('GET',null,owner.token,'/answer?entry=true'),context)).json();
  await check('Current device answers through the normal quiz handler; retry cannot score twice', async () => {
    const answer = {question_id:questionId,chosen_label:'A',question_token:entry.question_token,time_taken_ms:100};
    assert.equal((await routes.answer.POST(request('POST',answer,owner.token),context)).status,200);
    await globalThis.__lobbyQA.after();
    const retry = await routes.answer.POST(request('POST',{...answer,chosen_label:'B'},owner.token),context);
    assert.equal(retry.status,200);assert.equal(globalThis.__lobbyQA.answerWrites,1);
    assert.equal((await database.ref(`sessions/${sessionId}/scores/qa-player/score`).get()).val(),5);
  });
  await check('Finishing saves current standings, removes the live index, and safely retries a lost response', async () => {
    const body={final_question_id:questionId,final_question_token:entry.question_token,final_choice_label:'A'};
    const first=await routes.complete.POST(request('POST',body,owner.token),context);
    assert.equal(first.status,200);assert.equal((await first.json()).total_score,5);
    assert.equal((await database.ref(`sessions/${sessionId}/scores/qa-player/finished`).get()).val(),true);
    assert.equal((await database.ref(`userSessions/qa-player/${sessionId}`).get()).exists(),false);
    const retry=await routes.complete.POST(request('POST',body,owner.token),context);
    assert.equal(retry.status,200);assert.equal((await retry.json()).total_score,5);assert.equal(globalThis.__lobbyQA.completionWrites,1);
  });
  await check('Ordinary private solo sessions remain playable when a legacy score-only Firebase node exists', async () => {
    session.user_id='qa-player';progress.clear();
    await database.ref(`sessions/${sessionId}`).set({scores:{'qa-player':{score:5}}});
    const response=await routes.answer.GET(request('GET',null,null,'/answer?entry=true'),context);
    assert.equal(response.status,200);assert.equal((await response.json()).id,questionId);
    session.user_id='qa-host';
  });
  console.log(`${count} isolated API integration scenarios passed (real RTDB emulator; SQL/Auth adapters).`);
  if (process.argv.includes('--serve')) {
    await seed('preview');
    const fixtureRoom = database.ref(`sessions/${sessionId}`);
    const now = Date.now();
    await fixtureRoom.update({players:{
      'sample-1':{displayName:'Alex Morgan',photoURL:null,joinedAt:now-4000,connectionId:'sample-1',roundId:'preview'},
      'sample-2':{displayName:'Narin Chai',photoURL:null,joinedAt:now-3000,connectionId:'sample-2',roundId:'preview'},
      'sample-3':{displayName:'Priya Sharma',photoURL:null,joinedAt:now-2000,connectionId:'sample-3',roundId:'preview'},
    },scores:{
      'sample-1':{displayName:'Alex Morgan',photoURL:null,score:16,updatedAt:now,roundId:'preview',currentQuestionLabel:'Reading nutrition labels'},
      'sample-2':{displayName:'Narin Chai',photoURL:null,score:16,updatedAt:now,roundId:'preview',finished:true},
      'sample-3':{displayName:'Priya Sharma',photoURL:null,score:0,updatedAt:now,roundId:'preview'},
    },connections:{
      'sample-1':{'sample-1':{transport:true}},'sample-2':{'sample-2':{transport:true}},'sample-3':{'sample-3':{transport:true}},
    }});
    session.name='Everyday health decisions'; session.question_count=8;
    await buildFrontend(temp);
    const cssDir = path.resolve('.next/static/chunks');
    const baseCss = (await Promise.all((await readdir(cssDir)).filter(name=>name.endsWith('.css')).map(name=>readFile(path.join(cssDir,name),'utf8')))).join('\n');
    const fixtureHeartbeat=setInterval(() => {for(const uid of ['sample-1','sample-2','sample-3'])void fixtureRoom.child(`players/${uid}/lastActiveAt`).set(Date.now());},30_000);
    const server = createServer(async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url,'http://127.0.0.1:4318');
        if(url.pathname==='/bundle.js' || url.pathname==='/bundle.css') {
          outgoing.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');
          outgoing.end(await readFile(path.join(temp,url.pathname.slice(1)))); return;
        }
        if(url.pathname==='/base.css') {outgoing.setHeader('Content-Type','text/css');outgoing.end(baseCss);return;}
        if(url.pathname.startsWith('/api/')) {
          let body='';for await(const chunk of incoming)body+=chunk;
          const headers=new Headers(incoming.headers);
          const req = new Request(url,{method:incoming.method,headers,...(body?{body}: {})}); req.nextUrl=url;
          let response;
          if(url.pathname.endsWith('/join')) response=await routes.join.POST(req,context);
          else if(url.pathname.endsWith('/presence')) response=await routes.presence[incoming.method](req,context);
          else if(url.pathname.startsWith('/api/admin/') && url.pathname.endsWith('/lobby')) response=await routes.host[incoming.method](req,context);
          else if(url.pathname.endsWith('/answer')) response=await routes.answer[incoming.method](req,context);
          else if(url.pathname.endsWith('/complete')) response=await routes.complete.POST(req,context);
          else if(url.pathname.includes('/api/join/')) response=await routes.invitation.GET(req,{params:Promise.resolve({token:url.pathname.split('/').pop()})});
          else if(url.pathname.endsWith('/preview')) response=Response.json({media_url:null,media_type:null});
          else if(url.pathname.endsWith('/leaderboard')) response=Response.json([]);
          else response=Response.json(session);
          outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(await response.text());return;
        }
        if(url.pathname==='/mobile') {
          outgoing.setHeader('Content-Type','text/html; charset=utf-8');
          outgoing.end(`<!doctype html><html><head><meta charset="utf-8"><title>390px mobile layout check</title><style>body{margin:0;background:#edf0f5;font-family:Arial}h1{font-size:16px;text-align:center;padding:12px}iframe{display:block;width:390px;height:844px;border:1px solid #aaa;margin:0 auto 20px}</style></head><body><h1>Mobile layout · 390 × 844 · actual components in an isolated frame</h1><iframe title="Mobile Private Lobby" src="/admin/questions/${sessionId}/lobby?theme=dark&lang=th"></iframe></body></html>`);return;
        }
        outgoing.setHeader('Content-Type','text/html; charset=utf-8');
        outgoing.end(`<!doctype html><html data-theme="${url.searchParams.get('theme')==='dark'?'dark':'light'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private lobby — isolated preview</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}#qa-label{padding:8px 20px;background:#17324d;color:#fff;font-size:12px}#root{padding:20px}body:has(main) #root{padding:0}</style></head><body><div id="qa-label">Local QA · simulated accounts and quiz answers · real Firebase emulator</div><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`);
      } catch(error) {console.error(error);outgoing.writeHead(500);outgoing.end('QA server error');}
    });
    await new Promise(resolve=>server.listen(4318,'127.0.0.1',resolve));
    console.log('UI sandbox: http://127.0.0.1:4318/admin/questions/'+sessionId+'/lobby');
    await new Promise(resolve => { process.once('SIGINT',()=>server.close(resolve));process.once('SIGTERM',()=>server.close(resolve)); });
    clearInterval(fixtureHeartbeat);
  }
} finally {
  await database.ref().remove(); await app.delete(); await rm(temp,{recursive:true,force:true});
}

async function buildFrontend(temp) {
  const root = process.cwd();
  const entry = path.join(temp,'entry.tsx');
  await writeFile(entry, `import React from 'react';import {createRoot} from '${root}/node_modules/react-dom/client.js';
    import Admin from '${root}/app/(dashboard)/admin/questions/[sessionId]/lobby/page.tsx';
    import Player from '${root}/app/play/[sessionId]/lobby/page.tsx';
    import Layout from '${root}/app/play/[sessionId]/layout.tsx';
    import Question from '${root}/app/play/[sessionId]/question/page.tsx';
    import Join from '${root}/app/join/[token]/page.tsx';
    import i18n from '${root}/lib/i18n/index.ts';
    const query=new URLSearchParams(location.search);await i18n.changeLanguage(query.get('lang')||'en');
    const originalFetch=window.fetch.bind(window);window.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('X-QA-User',location.pathname.startsWith('/admin')?'qa-host':'qa-player');return originalFetch(url,{...options,headers});};
    const params=Promise.resolve({sessionId:'${sessionId}'}),joinParams=Promise.resolve({token:'invite-preview'});
    const Page=location.pathname.startsWith('/admin')?<Admin params={params}/>:location.pathname.startsWith('/join')?<Join params={joinParams}/>:<Layout params={params}>{location.pathname.endsWith('/question')?<Question params={params}/>:<Player params={params}/>}</Layout>;
    createRoot(document.getElementById('root')).render(<React.Suspense fallback={<p>Loading preview…</p>}>{Page}</React.Suspense>);`);
  const browserShims = {
    '@/lib/hooks/useAuth': `const user={uid:location.pathname.startsWith('/admin')?'qa-host':'qa-player',displayName:'Jordan Lee',photoURL:null,isAnonymous:false};export const useAuth=()=>({user,isAdmin:location.pathname.startsWith('/admin'),loading:false});`,
    '@/components/ui/Toast': `export const useToast=()=>({showToast:(message)=>console.info(message)});`,
    '@/lib/firebase/analytics': `export const trackEvent=()=>{};`,
    'next/navigation': `const router={push:url=>location.assign(url),replace:url=>location.replace(url)};export const useRouter=()=>router;`,
    'next/link': `import React from '${root}/node_modules/react/index.js';export default function Link(props){return React.createElement('a',props);}`,
    'qa-firebase': `import {initializeApp} from '${root}/node_modules/firebase/app/dist/esm/index.esm.js';
      import {getDatabase,connectDatabaseEmulator} from '${root}/node_modules/firebase/database/dist/esm/index.esm.js';
      const app=initializeApp({projectId:'demo-novarquiz',databaseURL:'https://demo-novarquiz-default-rtdb.firebaseio.com'});
      connectDatabaseEmulator(getDatabase(app),'127.0.0.1',9005,{mockUserToken:{sub:location.pathname.startsWith('/admin')?'qa-host':'qa-player'}});export default app;`,
  };
  const frontendPlugin={name:'qa-browser-boundaries',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.path==='./config' && args.importer.endsWith('/lib/firebase/rtdb.ts'))return {path:'qa-firebase',namespace:'qa-browser'};
      if(browserShims[args.path])return {path:args.path,namespace:'qa-browser'};
      if(args.path.startsWith('@/'))return {path:path.resolve(root,args.path.slice(2)+(path.extname(args.path)?'':resolveExtension(args.path.slice(2))))};
    });
    build.onLoad({filter:/.*/,namespace:'qa-browser'},args=>({contents:browserShims[args.path],loader:'js',resolveDir:root}));
  }};
  await build({entryPoints:[entry],outfile:path.join(temp,'bundle.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',nodePaths:[path.join(root,'node_modules')],plugins:[frontendPlugin],logLevel:'silent'});
}
function resolveExtension(file) {
  const fs=process.getBuiltinModule('fs');
  for(const extension of ['.ts','.tsx','.js','/index.ts','/index.tsx'])if(fs.existsSync(file+extension))return extension;
  throw new Error('Cannot resolve '+file);
}
