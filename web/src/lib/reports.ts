import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MonthlyReviewDto, ReportDto, ReportPeriod } from '@/lib/types';

export function useReport(period: ReportPeriod) {
  return useQuery({
    queryKey: ['report', period],
    queryFn: () => api.get<{ report: ReportDto }>(`/api/reports/${period}`),
    select: (r) => r.report,
    staleTime: 60_000,
  });
}

/**
 * The written monthly review. A POST because it may call the model, so it is
 * never fired on mount: the page offers a button and the user decides.
 */
export function useMonthlyReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ review: MonthlyReviewDto; range: { from: string; to: string; label: string } }>('/api/reports/monthly-review'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['report', 'month'] });
    },
  });
}

/**
 * Download the CSV.
 *
 * A plain anchor to the endpoint would work for the session cookie, but it
 * would fail silently on an error response. Fetching it keeps the failure
 * visible, and the file is built from this user's rows only because the
 * server scopes the query by the authenticated user.
 */
export async function downloadReportCsv(period: ReportPeriod): Promise<void> {
  // `api.raw` carries the access token and the refresh path, so a download
  // behaves like every other authenticated call instead of a bare fetch.
  const res = await api.raw(`/api/reports/${period}/csv`);
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `ai-lifehub-${period}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in Safari, so it waits a beat.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const PERIOD_LABEL: Record<ReportPeriod, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};
