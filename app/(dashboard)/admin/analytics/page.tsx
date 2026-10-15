'use client';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import DemographicsPanel from '@/components/admin/DemographicsPanel';
import ProvinceExplorer from '@/components/admin/province-map/ProvinceExplorer';
export default function AnalyticsPage(){const {i18n}=useTranslation();const th=i18n.language.startsWith('th');return <div className="mx-auto max-w-[1500px] space-y-6"><Suspense fallback={null}><ProvinceExplorer/></Suspense><h2 className="text-lg font-bold">{th?'ภาพรวมทั้งประเทศ':'Whole country'}</h2><DemographicsPanel/></div>;}
