'use client';
import DemographicsPanel from '@/components/admin/DemographicsPanel';
import { useTranslation } from 'react-i18next';
export default function AnalyticsPage(){const {i18n}=useTranslation();const th=i18n.language.startsWith('th');return <div className="mx-auto max-w-6xl space-y-6"><header><h1 className="text-2xl font-bold">{th?'ภาพรวมผู้เรียน':'Audience analytics'}</h1><p className="mt-2 text-sm opacity-70">{th?'ข้อมูลจากแบบสอบถามสำหรับวางแผนการเรียนรู้':'Understand your audience and plan learning content.'}</p></header><DemographicsPanel/></div>;}
