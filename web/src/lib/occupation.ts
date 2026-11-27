// ─────────────────────────────────────────────────────────────
// Occupation, on the client.
// ─────────────────────────────────────────────────────────────
// The server owns the profiles (server/src/services/occupations.ts) and sends
// the resolved one with the dashboard. This hook is how a page reads it, so no
// component has to know the classification rules or carry its own copy of the
// vocabulary.

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OccupationProfile, ResolvedOccupation } from '@/lib/types';

export interface OccupationResponse {
  occupation: ResolvedOccupation;
  options: OccupationProfile[];
}

export function useOccupation() {
  return useQuery({
    queryKey: ['occupation'],
    queryFn: () => api.get<OccupationResponse>('/api/users/occupation'),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Vocabulary with a safe fallback, so a component renders correctly before the
 * request lands (and if it fails). The fallbacks are the generic words, never
 * a guess at what the person does.
 */
export function useNouns() {
  const { data } = useOccupation();
  const nouns = data?.occupation.profile.nouns;
  return (
    nouns ?? {
      project: 'Project',
      projects: 'Projects',
      session: 'Session',
      sessions: 'Sessions',
      sessionLabel: 'Area',
    }
  );
}
