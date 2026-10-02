import test from 'node:test';
import assert from 'node:assert/strict';
import { SurveySchema, summarizeSurveys, histogram, type SurveyInput } from '../survey';
const base:SurveyInput={firstName:'Jane',lastName:'Doe',age:30,gender:'female',weightKg:70,heightCm:165,activity:'moderate',analyticsConsent:true};
test('survey validation allows withholding optional data and rejects invalid measurements and identity spoofing',()=>{
  assert.ok(SurveySchema.safeParse({...base,age:null,weightKg:null,heightCm:null,analyticsConsent:false}).success);
  for(const change of [{firstName:' '},{lastName:''},{age:-1},{age:121},{age:1.2},{weightKg:0},{weightKg:501},{heightCm:251},{gender:'unsupported'},{analyticsConsent:'yes'},{uid:'other-account'}])assert.equal(SurveySchema.safeParse({...base,...change}).success,false);
  assert.equal(SurveySchema.parse({...base,firstName:' Jane '}).firstName,'Jane');
});

test('histogram uses equal widths, retains empty intervals and handles decimal boundaries',()=>{
  const result=histogram([49.9,50,50.1,70,null]);
  assert.deepEqual(result.bins.map(bin=>[bin.start,bin.end,bin.count]),[[40,50,1],[50,60,2],[60,70,0],[70,80,1]]);
  assert.equal(result.answered,4);assert.equal(result.missing,1);
  assert.equal(result.bins.reduce((sum,bin)=>sum+bin.count,0),result.answered);
});

test('histogram includes maximum valid values and treats missing data separately from zero',()=>{
  for(const maximum of [120,250,500]){
    const result=histogram([maximum]);
    assert.deepEqual(result.bins.map(bin=>[bin.start,bin.end,bin.count]),[[maximum,maximum+10,1]]);
  }
  assert.deepEqual(histogram([null,null]),{bins:[],answered:0,missing:2,binWidth:10});
  assert.deepEqual(histogram([]),{bins:[],answered:0,missing:0,binWidth:10});
  assert.throws(()=>histogram([30],0));
});

test('numeric histograms only include consenting participants and count missing responses',()=>{
  const report=summarizeSurveys(3,[base,{...base,age:80,weightKg:90,heightCm:180,analyticsConsent:false},{...base,age:null,weightKg:null,heightCm:null}]);
  for(const chart of Object.values(report.histograms)){
    assert.equal(chart.answered,1);assert.equal(chart.missing,1);
    assert.equal(chart.bins.length,1);assert.equal(chart.bins[0].count,1);
  }
  assert.equal(report.histograms.age.bins[0].start,30);
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
