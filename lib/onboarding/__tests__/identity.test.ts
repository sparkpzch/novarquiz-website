import test from 'node:test';
import assert from 'node:assert/strict';
import { surveyIdentity } from '../identity';
test('signup token supplies its own identity even when another account has a cookie',async()=>{
  const deps={session:async()=>({uid:'existing-admin'}),verify:async()=>({uid:'new-account',firebase:{sign_in_provider:'password'}})};
  assert.equal(await surveyIdentity('Bearer signed-token',deps),'new-account');
  assert.equal(await surveyIdentity(null,deps),'existing-admin');
});
test('invalid and anonymous tokens cannot save questionnaire data or fall back to a different account',async()=>{
  const deps={session:async()=>({uid:'existing-admin'}),verify:async()=>{throw new Error('Invalid token');}};
  for(const header of ['Bearer invalid','Bearer ','Basic abc'])assert.equal(await surveyIdentity(header,deps),null);
  assert.equal(await surveyIdentity('Bearer anonymous',{...deps,verify:async()=>({uid:'guest',firebase:{sign_in_provider:'anonymous'}})}),null);
  assert.equal(await surveyIdentity(null,{...deps,session:async()=>null}),null);
});
