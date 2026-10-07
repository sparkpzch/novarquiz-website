// Actual Cloud Storage Rules runtime; synthetic emulator identities only.
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
const endpoint=process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if(!endpoint || !/^(127\.0\.0\.1|localhost):\d+$/.test(endpoint))throw new Error('Use the local storage emulator.');
const bucket='demo-novarquiz.appspot.com', uid='qa-storage-owner', apps=[];
function client(id,provider='password',verified=true){
  const app=initializeApp({projectId:'demo-novarquiz',storageBucket:bucket},id);apps.push(app);
  const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',Number(endpoint.split(':')[1]),{mockUserToken:{sub:id,email_verified:verified,firebase:{sign_in_provider:provider}}});return storage;
}
const owner=client(uid), stranger=client('qa-storage-stranger'), anonymous=client('qa-storage-anon','anonymous'), unverified=client('qa-storage-unverified','password',false);
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]), metadata={contentType:'image/png'};
const original='quiz-media/original-qa-rules.mp4';
const seed=async()=>{
  const response=await fetch(`http://${endpoint}/v0/b/${bucket}/o?name=${encodeURIComponent(original)}`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/octet-stream'},body:bytes});
  assert.equal(response.status,200,await response.text());
};
try{
  await uploadBytes(ref(owner,'Users/Profile Pictures/'+uid),bytes,metadata);
  assert.ok(await getDownloadURL(ref(stranger,'Users/Profile Pictures/'+uid)));
  await assert.rejects(uploadBytes(ref(stranger,'Users/Profile Pictures/'+uid),bytes,metadata),/unauthorized/);
  console.log('PASS verified profile owner can upload one profile object; others cannot overwrite it');
  await assert.rejects(uploadBytes(ref(owner,'Users/Arbitrary Folder/'+uid),bytes,metadata),/unauthorized/);
  await assert.rejects(uploadBytes(ref(anonymous,'Users/Profile Pictures/qa-storage-anon'),bytes,metadata),/unauthorized/);
  await assert.rejects(uploadBytes(ref(unverified,'Users/Profile Pictures/qa-storage-unverified'),bytes,metadata),/unauthorized/);
  console.log('PASS arbitrary profile folders, anonymous identities and unverified accounts cannot bypass upload restrictions');
  await assert.rejects(uploadBytes(ref(owner,'quiz-media/qa-image.png'),bytes,metadata),/unauthorized/);
  await seed();
  await assert.rejects(getDownloadURL(ref(owner,original)),/unauthorized/);
  await assert.rejects(getDownloadURL(ref(stranger,original)),/unauthorized/);
  console.log('PASS direct quiz uploads are denied and private original video objects are unreadable');
  console.log('3 Cloud Storage security-rule scenarios passed.');
}finally{
  await deleteObject(ref(owner,'Users/Profile Pictures/'+uid)).catch(()=>{});
  await fetch(`http://${endpoint}/v0/b/${bucket}/o/${encodeURIComponent(original)}`,{method:'DELETE',headers:{Authorization:'Bearer owner'}});
  await Promise.all(apps.map(deleteApp));
}
