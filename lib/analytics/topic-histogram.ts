import type { HistogramData } from '@/lib/onboarding/survey';

/** Percentages are bounded to 0–100; 100 belongs in the final interval. */
export function percentageHistogram(items: { percentage: number | null }[]): HistogramData {
  const bins = Array.from({ length: 5 }, (_, i) => ({ start: i * 20, end: (i + 1) * 20, label: `${i * 20}–${(i + 1) * 20}`, count: 0 }));
  let missing = 0;
  for (const { percentage } of items) {
    if (percentage === null || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) { missing++; continue; }
    bins[Math.min(4, Math.floor(percentage / 20))].count++;
  }
  return { bins, answered: items.length - missing, missing, binWidth: 20 };
}

export const topicHistogram = percentageHistogram;
