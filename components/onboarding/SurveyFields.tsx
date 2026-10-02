'use client';
import type { SurveyInput } from '@/lib/onboarding/survey';
import styles from './survey.module.css';

export const emptySurvey: SurveyInput = { firstName:'',lastName:'',age:null,gender:'prefer_not_to_say',weightKg:null,heightCm:null,activity:'prefer_not_to_say',analyticsConsent:false };
export default function SurveyFields({value,onChange,th=false}:{value:SurveyInput;onChange:(value:SurveyInput)=>void;th?:boolean}) {
  const copy=(en:string,thai:string)=>th?thai:en;
  const change=<K extends keyof SurveyInput>(key:K,v:SurveyInput[K])=>onChange({...value,[key]:v});
  return <div className={styles.fields}>
    <div className={styles.grid}>
      <label>{copy('First name','ชื่อ')}<input required autoComplete="given-name" maxLength={80} value={value.firstName} onChange={e=>change('firstName',e.target.value)} /></label>
      <label>{copy('Last name','นามสกุล')}<input required autoComplete="family-name" maxLength={80} value={value.lastName} onChange={e=>change('lastName',e.target.value)} /></label>
      <label>{copy('Age (years)','อายุ (ปี)')}<input type="number" inputMode="numeric" min={1} max={120} step={1} placeholder={copy('Prefer not to say','ไม่ประสงค์ระบุ')} value={value.age??''} onChange={e=>change('age',e.target.value===''?null:Number(e.target.value))} /></label>
      <label>{copy('Gender','เพศ')}<select value={value.gender} onChange={e=>change('gender',e.target.value as SurveyInput['gender'])}><option value="prefer_not_to_say">{copy('Prefer not to say','ไม่ประสงค์ระบุ')}</option><option value="female">{copy('Female','หญิง')}</option><option value="male">{copy('Male','ชาย')}</option><option value="other">{copy('Other','อื่น ๆ')}</option></select></label>
      <label>{copy('Weight (kg) · optional','น้ำหนัก (กก.) · ไม่บังคับ')}<input type="number" inputMode="decimal" min={1} max={500} step="0.1" value={value.weightKg??''} onChange={e=>change('weightKg',e.target.value===''?null:Number(e.target.value))} /></label>
      <label>{copy('Height (cm) · optional','ส่วนสูง (ซม.) · ไม่บังคับ')}<input type="number" inputMode="decimal" min={30} max={250} step="0.1" value={value.heightCm??''} onChange={e=>change('heightCm',e.target.value===''?null:Number(e.target.value))} /></label>
    </div>
    <label>{copy('Usual activity level · optional','ระดับกิจกรรมในชีวิตประจำวัน · ไม่บังคับ')}<select value={value.activity} onChange={e=>change('activity',e.target.value as SurveyInput['activity'])}><option value="prefer_not_to_say">{copy('Prefer not to say','ไม่ประสงค์ระบุ')}</option><option value="low">{copy('Mostly sitting','นั่งเป็นส่วนใหญ่')}</option><option value="moderate">{copy('Some walking or exercise','เดินหรือออกกำลังกายบ้าง')}</option><option value="high">{copy('Frequently active','เคลื่อนไหวหรือออกกำลังกายเป็นประจำ')}</option></select></label>
    <label className={styles.consent}><input type="checkbox" checked={value.analyticsConsent} onChange={e=>change('analyticsConsent',e.target.checked)} /><span>{copy('I agree to include my survey answers in administrator demographic charts. This is optional; I can still use the website without opting in.','ยินยอมให้นำคำตอบไปใช้ในกราฟข้อมูลภาพรวมสำหรับผู้ดูแล การยินยอมนี้เป็นทางเลือกและไม่กระทบการใช้งานเว็บไซต์')}</span></label>
    <p className={styles.note}>{copy('Your name becomes your profile name. These answers are not sent to the AI summary service. You can update your answers and consent in Profile.','ชื่อจะใช้เป็นชื่อโปรไฟล์ ข้อมูลนี้จะไม่ส่งให้ AI Summary คุณแก้ไขข้อมูลและความยินยอมได้ในหน้าโปรไฟล์')}</p>
  </div>;
}
