import { useQuery } from '@tanstack/react-query';
import { api, setStorefrontAccessToken } from '../../api/client';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'VENDOR' | 'ADMIN';
  twoFactorEnabled?: boolean;
};
export const authQueryKey = ['auth', 'me'] as const;
export function useAuth() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: async ({ signal }) => {
      const result = (
        await api.get<{ data: { user: AuthUser & { roles?: string[] }; accessToken?: string } }>(
          '/auth/me',
          { signal, timeout: 8000 },
        )
      ).data.data;
      if (result.accessToken) setStorefrontAccessToken(result.accessToken);
      const roles = result.user.roles ?? [];
      return {
        ...result.user,
        role:
          result.user.role ??
          (roles.includes('ADMIN') ? 'ADMIN' : roles.includes('VENDOR') ? 'VENDOR' : 'CUSTOMER'),
      } as AuthUser;
    },
    retry: false,
    staleTime: 30_000,
  });
}
