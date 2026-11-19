import { useQuery } from '@tanstack/react-query';
import { api, setStorefrontAccessToken } from '../../api/client';

export type AuthRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN';
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  roles: AuthRole[];
  vendorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  twoFactorEnabled?: boolean;
};
export type AuthUserResponse = Omit<AuthUser, 'role' | 'roles'> & { roles: AuthRole[] };
export function normalizeAuthUser(user: AuthUserResponse, activeRole?: AuthRole): AuthUser {
  const role =
    activeRole && user.roles.includes(activeRole)
      ? activeRole
      : user.roles.includes('ADMIN')
        ? 'ADMIN'
        : user.roles.includes('VENDOR')
          ? 'VENDOR'
          : 'CUSTOMER';
  return { ...user, role };
}
export const authQueryKey = ['auth', 'me'] as const;
export async function logoutCurrentSession(queryClient: { clear: () => void }) {
  try {
    await api.post('/auth/logout');
  } finally {
    setStorefrontAccessToken('');
    queryClient.clear();
  }
}

export function useAuth() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: async ({ signal }) => {
      const result = (
        await api.get<{
          data: {
            user: Omit<AuthUser, 'role' | 'roles'> & { roles: AuthRole[] };
            accessToken?: string;
          };
        }>('/auth/me', { signal, timeout: 8000 })
      ).data.data;
      if (result.accessToken) setStorefrontAccessToken(result.accessToken);
      return normalizeAuthUser(result.user);
    },
    retry: false,
    staleTime: 30_000,
  });
}
