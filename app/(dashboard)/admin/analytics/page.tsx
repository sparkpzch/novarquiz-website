'use client';
import DemographicsPanel from '@/components/admin/DemographicsPanel';
import { useTranslation } from 'react-i18next';
export default function AnalyticsPage(){const {i18n}=useTranslation();const th=i18n.language.startsWith('th');return <div className="mx-auto max-w-6xl space-y-6"><header><h1 className="text-2xl font-bold">{th?'ข้อมูลผู้เข้าร่วม':'Questionnaire results'}</h1><p className="mt-2 text-sm opacity-70">{th?'ข้อมูลจากแบบสอบถามของผู้เข้าร่วม':'Participant questionnaire results.'}</p></header><DemographicsPanel/></div>;}
