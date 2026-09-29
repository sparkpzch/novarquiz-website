'use client';

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
  label = 'Refresh',
  resourceLabel = 'analytics data',
}: RefreshButtonProps) {
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
        aria-label={`${label} ${resourceLabel}`}
      >
        <span className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true">↻</span>
        {isRefreshing ? 'Refreshing' : label}
      </button>
      <span className={`text-[10px] ${statusTheme}`} role="status" aria-live="polite">
        {refreshError ? 'Refresh failed · ' : ''}
        {lastFetchedAt
          ? `Fetched ${new Date(lastFetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Not fetched yet'}
      </span>
    </div>
  );
}
