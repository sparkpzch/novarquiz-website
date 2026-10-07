// Security-rule checks against the local Firebase Database Emulator only.
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, set, remove, get, update } from 'firebase/database';
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Use a local database emulator.');
const projectId = 'demo-novarquiz';
const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
const app = admin.initializeApp({projectId,databaseURL},'lobby-rules-qa');
const db = admin.database(app);
const playerId='qa-rules-player', sessionId='qa-rules-session';
const clients=[];
function client(uid) {
  const app = initializeApp({projectId,databaseURL},uid);
  const database = getDatabase(app);
  connectDatabaseEmulator(database,'127.0.0.1',Number(host.split(':')[1]),{mockUserToken:{sub:uid}});
  clients.push(app); return database;
}
const player=client(playerId), other=client('qa-rules-other'), hostClient=client('qa-rules-host');
try {
  await db.ref(`sessions/${sessionId}`).set({status:'waiting',hostId:'qa-rules-host',roundId:'round',players:{[playerId]:{displayName:'QA',joinedAt:Date.now(),connectionId:'latest',roundId:'round'}},scores:{[playerId]:{displayName:'QA',score:10,updatedAt:Date.now()}},connections:{[playerId]:{old:{transport:true},latest:{transport:true}}}});
  await db.ref(`userSessions/${playerId}/${sessionId}`).set({sessionId,connectionId:'latest'});
  await assert.rejects(remove(ref(player,`sessions/${sessionId}/players/${playerId}`)),/PERMISSION_DENIED/);
  await assert.rejects(update(ref(player,`sessions/${sessionId}/scores/${playerId}`),{currentQuestionLabel:'stale'}),/PERMISSION_DENIED/);
  await assert.rejects(remove(ref(player,`userSessions/${playerId}/${sessionId}`)),/PERMISSION_DENIED/);
  console.log('PASS old account-wide cleanup and client metadata cannot alter managed entries');
  await remove(ref(player,`sessions/${sessionId}/connections/${playerId}/old/transport`));
  assert.equal((await get(ref(player,`sessions/${sessionId}/connections/${playerId}/latest/transport`))).val(),true);
  await assert.rejects(set(ref(other,`sessions/${sessionId}/connections/${playerId}/latest/transport`),false),/PERMISSION_DENIED/);
  console.log('PASS scoped old transport removal preserves latest transport; other accounts cannot write it');
  await set(ref(player,`userSessions/${playerId}/legacy`),{sessionId:'legacy',joinedAt:Date.now()});
  await remove(ref(player,`userSessions/${playerId}/legacy`));
  console.log('PASS legacy solo/team session index cleanup continues to work');
  await assert.rejects(get(ref(other,`sessions/${sessionId}`)),/Permission denied/);
  await assert.rejects(set(ref(other,`sessions/${sessionId}/players/qa-rules-other`),{displayName:'Intruder',joinedAt:Date.now()}),/PERMISSION_DENIED/);
  await assert.rejects(update(ref(hostClient,`sessions/${sessionId}`),{status:'started'}),/PERMISSION_DENIED/);
  console.log('PASS non-members cannot read private sessions or self-admit; host mutations require the API');
  const teamId='qa-rules-team';
  await db.ref(`teamRooms/${teamId}`).set({hostId:'qa-rules-host',sessionId:'quiz',status:'waiting',players:{[playerId]:{displayName:'QA',joinedAt:Date.now()}}});
  await db.ref(`teamRoomSecrets/${teamId}`).set({pin:'123456',joinAttempts:{[playerId]:2}});
  for(const database of [player,other,hostClient])await assert.rejects(get(ref(database,`teamRoomSecrets/${teamId}`)),/Permission denied/);
  assert.ok((await get(ref(player,`teamRooms/${teamId}`))).exists());
  await assert.rejects(get(ref(other,`teamRooms/${teamId}`)),/Permission denied/);
  await assert.rejects(set(ref(other,`teamRooms/${teamId}/players/qa-rules-other`),{displayName:'Intruder',joinedAt:Date.now()}),/PERMISSION_DENIED/);
  await assert.rejects(remove(ref(player,`teamRooms/${teamId}/players/${playerId}`)),/PERMISSION_DENIED/);
  console.log('PASS team secrets are server-only and client membership writes cannot bypass PIN checks');
  await db.ref(`teamRooms/${teamId}/pin`).set('654321');
  for(const database of [player,hostClient])await assert.rejects(get(ref(database,`teamRooms/${teamId}`)),/Permission denied/);
  await db.ref().update({[`teamRooms/${teamId}`]:null,[`teamRoomSecrets/${teamId}`]:null});
  console.log('PASS legacy rooms containing a PIN remain unreadable until the server migrates it');
  console.log('6 Firebase security-rule scenarios passed.');
} finally {
  await db.ref().update({[`sessions/${sessionId}`]:null,[`userSessions/${playerId}`]:null});
  await Promise.all(clients.map(deleteApp)); await app.delete();
}
