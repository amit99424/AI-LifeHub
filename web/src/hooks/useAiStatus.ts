import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AiStatus } from '@/lib/types';
import { useAuth } from '@/lib/auth';

export function useAiStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<AiStatus>('/api/ai/status'),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
}
