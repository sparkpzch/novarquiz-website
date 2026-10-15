'use client';
import type { HealthInput, SurveyDraft } from '@/lib/onboarding/survey';
import { PROVINCES, REGION_LABELS } from '@/lib/onboarding/provinces';
import styles from './survey.module.css';

export const emptySurvey: SurveyDraft = { firstName:'',lastName:'',age:null,gender:'prefer_not_to_say',weightKg:null,heightCm:null,activity:'prefer_not_to_say',analyticsConsent:false,province:'',healthConsent:false,health:null };
const emptyHealth: HealthInput = { waistCm:null,smoking:'unknown',hypertension:'unknown',diabetes:'unknown',highCholesterol:'unknown',lipidCheck:'unknown',ldlRange:'unknown',lipidMedication:'unknown',familyHistory:'unknown',priorEvent:'unknown' };

type Option<T extends string> = [T,string,string];
function Choice<T extends string>({name,legend,hint,options,value,onChange,th}:{name:string;legend:string;hint?:string;options:Option<T>[];value:T;onChange:(v:T)=>void;th:boolean}) {
  return <fieldset className={styles.choice}>
    <legend>{legend}{hint&&<small>{hint}</small>}</legend>
    <div className={styles.segmented}>{options.map(([v,en,thai])=><label key={v}><input type="radio" name={name} value={v} checked={value===v} onChange={()=>onChange(v)} /><span>{th?thai:en}</span></label>)}</div>
  </fieldset>;
}

export default function SurveyFields({value,onChange,th=false}:{value:SurveyDraft;onChange:(value:SurveyDraft)=>void;th?:boolean}) {
  const copy=(en:string,thai:string)=>th?thai:en;
  const change=<K extends keyof SurveyDraft>(key:K,v:SurveyDraft[K])=>onChange({...value,[key]:v});
  const health=value.health??emptyHealth;
  const setHealth=<K extends keyof HealthInput>(key:K,v:HealthInput[K])=>onChange({...value,health:{...health,[key]:v}});
  const yesNo=(yes:string,no:string,unknown:string,yesTh:string,noTh:string,unknownTh:string):Option<'yes'|'no'|'unknown'>[]=>[['yes',yes,yesTh],['no',no,noTh],['unknown',unknown,unknownTh]];
  const diagnosed=yesNo('Yes','No','Not sure','ใช่','ไม่ใช่','ไม่แน่ใจ');
  const byName=(a:{th:string;en:string},b:{th:string;en:string})=>th?a.th.localeCompare(b.th,'th'):a.en.localeCompare(b.en);
  return <div className={styles.fields}>
    <div className={styles.grid}>
      <label>{copy('First name','ชื่อ')}<input required autoComplete="given-name" maxLength={80} value={value.firstName} onChange={e=>change('firstName',e.target.value)} /></label>
      <label>{copy('Last name','นามสกุล')}<input required autoComplete="family-name" maxLength={80} value={value.lastName} onChange={e=>change('lastName',e.target.value)} /></label>
      <label>{copy('Age (years)','อายุ (ปี)')}<input type="number" inputMode="numeric" min={1} max={120} step={1} placeholder={copy('Prefer not to say','ไม่ประสงค์ระบุ')} value={value.age??''} onChange={e=>change('age',e.target.value===''?null:Number(e.target.value))} /></label>
      <label>{copy('Gender','เพศ')}<select value={value.gender} onChange={e=>change('gender',e.target.value as SurveyDraft['gender'])}><option value="prefer_not_to_say">{copy('Prefer not to say','ไม่ประสงค์ระบุ')}</option><option value="female">{copy('Female','หญิง')}</option><option value="male">{copy('Male','ชาย')}</option><option value="other">{copy('Other','อื่น ๆ')}</option></select></label>
      <label>{copy('Weight (kg) · optional','น้ำหนัก (กก.) · ไม่บังคับ')}<input type="number" inputMode="decimal" min={1} max={500} step="0.1" value={value.weightKg??''} onChange={e=>change('weightKg',e.target.value===''?null:Number(e.target.value))} /></label>
      <label>{copy('Height (cm) · optional','ส่วนสูง (ซม.) · ไม่บังคับ')}<input type="number" inputMode="decimal" min={30} max={250} step="0.1" value={value.heightCm??''} onChange={e=>change('heightCm',e.target.value===''?null:Number(e.target.value))} /></label>
    </div>
    <label className={styles.row}>{copy('Province you live in','จังหวัดที่อาศัยอยู่')}<select required value={value.province} onChange={e=>change('province',e.target.value as SurveyDraft['province'])}>
      <option value="" disabled>{copy('Choose a province','เลือกจังหวัด')}</option>
      <option value="prefer_not_to_say">{copy('Prefer not to say','ไม่ประสงค์ระบุ')}</option>
      {REGION_LABELS.map(({region,en,th:thai})=><optgroup key={region} label={th?thai:en}>{PROVINCES.filter(p=>p.region===region).sort(byName).map(p=><option key={p.code} value={p.code}>{th?p.th:p.en}</option>)}</optgroup>)}
    </select></label>
    <label>{copy('Usual activity level · optional','ระดับกิจกรรมในชีวิตประจำวัน · ไม่บังคับ')}<select value={value.activity} onChange={e=>change('activity',e.target.value as SurveyDraft['activity'])}><option value="prefer_not_to_say">{copy('Prefer not to say','ไม่ประสงค์ระบุ')}</option><option value="low">{copy('Mostly sitting','นั่งเป็นส่วนใหญ่')}</option><option value="moderate">{copy('Some walking or exercise','เดินหรือออกกำลังกายบ้าง')}</option><option value="high">{copy('Frequently active','เคลื่อนไหวหรือออกกำลังกายเป็นประจำ')}</option></select></label>
    <label className={styles.consent}><input type="checkbox" checked={value.analyticsConsent} onChange={e=>change('analyticsConsent',e.target.checked)} /><span>{copy('I agree to include my survey answers in administrator demographic charts. This is optional; I can still use the website without opting in.','ยินยอมให้นำคำตอบไปใช้ในกราฟข้อมูลภาพรวมสำหรับผู้ดูแล การยินยอมนี้เป็นทางเลือกและไม่กระทบการใช้งานเว็บไซต์')}</span></label>

    <section className={styles.section} aria-labelledby="survey-health-title">
      <h3 id="survey-health-title">{copy('Heart health and blood lipids · optional','สุขภาพหัวใจและไขมันในเลือด · ไม่บังคับ')}</h3>
      <p className={styles.sectionIntro}>{copy('About 2 minutes. Answers are combined by province to plan heart disease prevention. They are not used to diagnose you.','ใช้เวลาประมาณ 2 นาที คำตอบจะนำไปรวมเป็นภาพรวมรายจังหวัด เพื่อวางแผนป้องกันโรคหัวใจและหลอดเลือด ไม่ได้ใช้วินิจฉัยตัวคุณ')}</p>
      <label className={styles.consent}><input type="checkbox" checked={value.healthConsent} onChange={e=>onChange({...value,healthConsent:e.target.checked,health:e.target.checked?emptyHealth:null})} /><span>{copy('I agree to share the health answers below for province-level summaries. I can withdraw in Profile at any time, and my health answers will be deleted.','ยินยอมให้ใช้ข้อมูลสุขภาพด้านล่างในการสรุปภาพรวมรายจังหวัด ยกเลิกได้ทุกเมื่อในหน้าโปรไฟล์ และข้อมูลสุขภาพจะถูกลบ')}</span></label>
      {value.healthConsent&&<div className={styles.healthFields}>
        <Choice th={th} name="smoking" legend={copy('Do you smoke?','คุณสูบบุหรี่ไหม')} value={health.smoking} onChange={v=>setHealth('smoking',v)} options={[['never','Never','ไม่เคย'],['former','Quit','เคย แต่เลิกแล้ว'],['current','Yes','ยังสูบอยู่'],['unknown','Prefer not to say','ไม่ระบุ']]}/>
        <p className={styles.groupLabel}>{copy('Has a doctor told you that you have…','แพทย์เคยบอกว่าคุณมีภาวะเหล่านี้ไหม')}</p>
        <Choice th={th} name="hypertension" legend={copy('High blood pressure','ความดันโลหิตสูง')} value={health.hypertension} onChange={v=>setHealth('hypertension',v)} options={diagnosed}/>
        <Choice th={th} name="diabetes" legend={copy('Diabetes','เบาหวาน')} value={health.diabetes} onChange={v=>setHealth('diabetes',v)} options={diagnosed}/>
        <Choice th={th} name="highCholesterol" legend={copy('High blood cholesterol','ไขมันในเลือดสูง')} value={health.highCholesterol} onChange={v=>setHealth('highCholesterol',v)} options={diagnosed}/>
        <Choice th={th} name="lipidCheck" legend={copy('When was your last blood cholesterol test?','ตรวจไขมันในเลือดครั้งล่าสุดเมื่อไร')} value={health.lipidCheck} onChange={v=>setHealth('lipidCheck',v)} options={[['within_1y','Within 1 year','ภายใน 1 ปี'],['within_5y','1–5 years ago','1–5 ปีก่อน'],['over_5y','Over 5 years ago','นานกว่า 5 ปี'],['never','Never','ไม่เคยตรวจ'],['unknown','Don’t remember','จำไม่ได้']]}/>
        <label>{copy('Latest LDL cholesterol (mg/dL)','ค่า LDL (ไขมันไม่ดี) ครั้งล่าสุด (มก./ดล.)')}<select value={health.ldlRange} onChange={e=>setHealth('ldlRange',e.target.value as HealthInput['ldlRange'])}>
          <option value="unknown">{copy('Don’t know','ไม่ทราบ')}</option>
          <option value="lt70">{copy('Below 70','ต่ำกว่า 70')}</option><option value="70_99">70–99</option><option value="100_129">100–129</option><option value="130_159">130–159</option><option value="160_189">160–189</option>
          <option value="gte190">{copy('190 or higher','190 ขึ้นไป')}</option>
        </select></label>
        <Choice th={th} name="lipidMedication" legend={copy('Do you take cholesterol-lowering medicine, such as a statin?','ตอนนี้กินยาลดไขมัน เช่น สแตติน อยู่ไหม')} value={health.lipidMedication} onChange={v=>setHealth('lipidMedication',v)} options={yesNo('Yes','No','Not sure','กินอยู่','ไม่ได้กิน','ไม่แน่ใจ')}/>
        <Choice th={th} name="familyHistory" legend={copy('Has a parent or sibling had heart disease or a stroke at a young age?','พ่อ แม่ หรือพี่น้อง เคยเป็นโรคหัวใจหรือหลอดเลือดสมองตั้งแต่อายุยังน้อยไหม')} hint={copy('Men before 55, women before 65','ผู้ชายก่อนอายุ 55 ปี ผู้หญิงก่อนอายุ 65 ปี')} value={health.familyHistory} onChange={v=>setHealth('familyHistory',v)} options={diagnosed}/>
        <Choice th={th} name="priorEvent" legend={copy('Have you had a heart attack or a stroke?','คุณเคยเป็นกล้ามเนื้อหัวใจขาดเลือด หรือหลอดเลือดสมอง (สโตรก) ไหม')} value={health.priorEvent} onChange={v=>setHealth('priorEvent',v)} options={yesNo('Yes','No','Not sure','เคย','ไม่เคย','ไม่แน่ใจ')}/>
        <label>{copy('Waist (cm) · optional','รอบเอว (ซม.) · ไม่บังคับ')}<input type="number" inputMode="decimal" min={30} max={250} step="0.1" placeholder={copy('Measure at the navel','วัดรอบสะดือ')} value={health.waistCm??''} onChange={e=>setHealth('waistCm',e.target.value===''?null:Number(e.target.value))} /></label>
      </div>}
    </section>
    <p className={styles.note}>{copy('Your name becomes your profile name. These answers are not sent to the AI summary service. You can update your answers and consent in Profile.','ชื่อจะใช้เป็นชื่อโปรไฟล์ ข้อมูลนี้จะไม่ส่งให้ AI Summary คุณแก้ไขข้อมูลและความยินยอมได้ในหน้าโปรไฟล์')}</p>
  </div>;
}
