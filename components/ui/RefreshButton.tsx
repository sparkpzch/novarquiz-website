'use client';

import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

export interface RefreshButtonProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastFetchedAt?: number | null;
  refreshError?: boolean;
  theme?: 'dark' | 'light';
  label?: string;
  resourceLabel?: string;
}

export default function RefreshButton({
  onRefresh,
  isRefreshing = false,
  lastFetchedAt = null,
  refreshError = false,
  theme = 'light',
  label,
  resourceLabel,
}: RefreshButtonProps) {
  const { t, i18n } = useTranslation();
  const buttonLabel = label ?? t('topic_breakdown.refresh');
  const resource = resourceLabel ?? t('topic_breakdown.resource');
  const dark = theme === 'dark';
  const buttonTheme = dark
    ? 'border-white/12 bg-[#0a1234] text-[#e4eaff] hover:border-[#7898ff]/60 hover:text-white'
    : 'border-[#0460A9]/20 bg-white text-[#16324F] hover:border-[#0460A9]/45 hover:text-[#0460A9]';
  const statusTheme = dark ? 'text-[#9aa8d1]' : 'text-[#5D7EA1]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-wait disabled:opacity-65 ${buttonTheme}`}
        aria-label={t('topic_breakdown.refresh_aria', { label: buttonLabel, resource })}
      >
        <span className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true">↻</span>
        {isRefreshing ? t('topic_breakdown.refreshing') : buttonLabel}
      </button>
      <span className={`text-[10px] ${statusTheme}`} role="status" aria-live="polite">
        {refreshError ? `${t('topic_breakdown.refresh_failed')} · ` : ''}
        {lastFetchedAt
          ? t('topic_breakdown.fetched', { time: new Date(lastFetchedAt).toLocaleTimeString(i18n.resolvedLanguage, { hour: 'numeric', minute: '2-digit' }) })
          : t('topic_breakdown.not_fetched')}
      </span>
    </div>
  );
}
