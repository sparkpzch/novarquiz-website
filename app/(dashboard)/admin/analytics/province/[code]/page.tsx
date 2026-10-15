'use client';
import { Suspense, use } from 'react';
import ProvinceDetail from '@/components/admin/province-detail/ProvinceDetail';
export default function ProvinceAnalyticsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <div className="mx-auto max-w-[1500px]"><Suspense fallback={null}><ProvinceDetail code={code} /></Suspense></div>;
}
