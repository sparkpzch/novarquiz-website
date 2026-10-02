'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/hooks/useAuth';
import SurveyFields, { emptySurvey } from './SurveyFields';
import type { SurveyInput } from '@/lib/onboarding/survey';
import styles from './survey.module.css';
import { PRIVACY_VERSION, TOS_VERSION } from '@/lib/privacy/versions';

const subscribeToClient = () => () => {};

export default function SurveyGate({editing=false}:{editing?:boolean}) {
  const {user,refreshUser}=useAuth();
  const clientReady = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const {i18n}=useTranslation(); const th=i18n.language.startsWith('th');
  const copy=(en:string,thai:string)=>th?thai:en;
  const [state,setState]=useState<'loading'|'required'|'complete'|'error'|'consent'>('loading');
  const [open,setOpen]=useState(false);
  const [value,setValue]=useState<SurveyInput>(emptySurvey);
  const [saving,setSaving]=useState(false);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const dialog=useRef<HTMLDivElement>(null);
  const uid=user?.uid;const anonymous=user?.isAnonymous;const displayName=user?.displayName;
  useEffect(()=>{
    if (!uid || anonymous) return;
    const abort=new AbortController();
    fetch('/api/onboarding',{signal:abort.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(async data=>{
      if (data.survey) { const {version: _version,...answers}=data.survey; void _version; setValue(answers); }
      else { const parts=(displayName??'').trim().split(/\s+/);setValue({...emptySurvey,firstName:parts[0]??'',lastName:parts.slice(1).join(' ')}); }
      if (data.required && !editing) {
        const response=await fetch('/api/auth/consent',{signal:abort.signal,cache:'no-store'});
        if (!response.ok) throw new Error();
        const consent=await response.json();
        if (!consent.consented || consent.privacy_version!==PRIVACY_VERSION || consent.tos_version!==TOS_VERSION) { setState('consent'); return; }
      }
      setState(data.required?'required':'complete');
    }).catch(()=>{if(!abort.signal.aborted)setState('error');});
    return ()=>abort.abort();
  },[uid,anonymous,displayName,retry,editing]);
  useEffect(()=>{const refresh=()=>setRetry(n=>n+1);window.addEventListener('novarquiz:consent-updated',refresh);return()=>window.removeEventListener('novarquiz:consent-updated',refresh);},[]);
  const visible=clientReady&&!!uid&&!anonymous&&(editing?open:state!=='complete'&&state!=='consent');
  useEffect(()=>{
    if (!visible) return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLElement>('input,button')?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[visible,state]);
  if (!user || user.isAnonymous) return null;
  return <>
    {editing&&<button className={styles.profileButton} onClick={()=>setOpen(true)}>{copy('Edit questionnaire & consent','แก้ไขแบบสอบถามและความยินยอม')}</button>}
    {visible&&createPortal(<div className={styles.overlay} onClick={e=>{if(e.target===e.currentTarget&&editing&&!saving)setOpen(false);}}><div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={editing?'survey-edit-title':'survey-title'} onKeyDown={e=>{
      if(e.key==='Escape'&&editing&&!saving)setOpen(false);
      if(e.key==='Tab'){const nodes=dialog.current?.querySelectorAll<HTMLElement>('input,select,button,a');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    }}>
      <p className={styles.eyebrow}>{copy('YOUR PROFILE','ข้อมูลของคุณ')}</p><h2 id={editing?'survey-edit-title':'survey-title'}>{editing?copy('Edit your questionnaire','แก้ไขแบบสอบถาม'):copy('Tell us a little about yourself','มารู้จักคุณให้มากขึ้น')}</h2>
      <p className={styles.intro}>{editing?copy('Update your details and analytics consent. Only your name is required.','แก้ไขข้อมูลและความยินยอมในการวิเคราะห์ บังคับเฉพาะชื่อและนามสกุล'):copy('A short questionnaire before you continue. Only your name is required.','แบบสอบถามสั้น ๆ ก่อนเริ่มใช้งาน บังคับเฉพาะชื่อและนามสกุล')}</p>
      {state==='loading'?<p role="status">{copy('Loading your profile…','กำลังโหลดข้อมูล…')}</p>:state==='error'?<div role="alert"><p>{copy('Could not load the questionnaire. Please try again.','โหลดแบบสอบถามไม่ได้ กรุณาลองอีกครั้ง')}</p><button className={styles.submit} onClick={()=>{setState('loading');setRetry(n=>n+1);}}>{copy('Try again','ลองอีกครั้ง')}</button></div>:<form onSubmit={async e=>{
        e.preventDefault();setSaving(true);setError('');
        try {const r=await fetch('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(!r.ok)throw new Error();await refreshUser();setState('complete');setOpen(false);}
        catch {setError(copy('Could not save. Please check the fields and try again.','บันทึกไม่ได้ โปรดตรวจสอบข้อมูลแล้วลองอีกครั้ง'));}finally{setSaving(false);}
      }}><SurveyFields value={value} onChange={setValue} th={th}/>{error&&<p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}>{editing&&<button className={styles.secondary} type="button" disabled={saving} onClick={()=>setOpen(false)}>{copy('Cancel','ยกเลิก')}</button>}<button className={styles.submit} disabled={saving}>{saving?copy('Saving…','กำลังบันทึก…'):editing?copy('Save changes','บันทึกการเปลี่ยนแปลง'):copy('Save & continue','บันทึกและไปต่อ')}</button></div></form>}
    </div></div>, document.body)}
  </>;
}
