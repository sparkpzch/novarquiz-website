import test from 'node:test';
import assert from 'node:assert/strict';
import { SurveySchema, summarizeSurveys, type SurveyInput } from '../survey';
const base:SurveyInput={firstName:'Jane',lastName:'Doe',age:30,gender:'female',weightKg:70,heightCm:165,activity:'moderate',analyticsConsent:true};
test('survey validation allows withholding optional data and rejects invalid measurements and identity spoofing',()=>{
  assert.ok(SurveySchema.safeParse({...base,age:null,weightKg:null,heightCm:null,analyticsConsent:false}).success);
  for(const change of [{firstName:' '},{lastName:''},{age:-1},{age:121},{age:1.2},{weightKg:0},{weightKg:501},{heightCm:251},{gender:'unsupported'},{analyticsConsent:'yes'},{uid:'other-account'}])assert.equal(SurveySchema.safeParse({...base,...change}).success,false);
  assert.equal(SurveySchema.parse({...base,firstName:' Jane '}).firstName,'Jane');
});
test('admin charts exclude nonconsenting answers while retaining completion totals',()=>{
  const result=summarizeSurveys(3,[base,{...base,age:80,gender:'male',analyticsConsent:false}]);
  assert.equal(result.total,3);assert.equal(result.completed,2);assert.equal(result.consenting,1);
  assert.equal(result.age.find(b=>b.label==='30–44')?.count,1);
  assert.equal(result.age.find(b=>b.label==='60+')?.count,0);
  assert.equal(result.gender.find(b=>b.label==='Male')?.count,0);
  assert.ok(!JSON.stringify(result).includes('Jane'));assert.ok(!JSON.stringify(result).includes('Doe'));
});
test('distribution boundaries and unanswered fields are counted exactly once per chart',()=>{
  const rows=[{...base,age:17,weightKg:49,heightCm:149},{...base,age:18,weightKg:50,heightCm:150},{...base,age:29,weightKg:69,heightCm:164},{...base,age:30,weightKg:70,heightCm:165},{...base,age:44,weightKg:89,heightCm:179},{...base,age:45,weightKg:90,heightCm:180},{...base,age:59},{...base,age:60},{...base,age:null,weightKg:null,heightCm:null}];
  const result=summarizeSurveys(rows.length,rows);
  assert.deepEqual(result.age.map(b=>b.count),[1,2,2,2,1,1]);
  for(const chart of [result.age,result.gender,result.weight,result.height,result.activity])assert.equal(chart.reduce((n,b)=>n+b.count,0),rows.length);
});
