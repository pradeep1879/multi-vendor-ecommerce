import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { showToast } from '../../components/feedback/toast';
import { authQueryKey, type AuthRole, type AuthUser } from '../features/auth/auth-state';
import { roleDestination } from './workspace-access';

export function useRoleSwitch() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: AuthRole) => {
      const response = await api.post<{
        data: { role: AuthRole; vendorStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' };
      }>('/auth/role/switch', { role });
      return response.data.data;
    },
    onSuccess: ({ role, vendorStatus }) => {
      queryClient.setQueryData(authQueryKey, (current: AuthUser | undefined) =>
        current ? { ...current, role, ...(vendorStatus ? { vendorStatus } : {}) } : current,
      );
      navigate(roleDestination(role, vendorStatus), { replace: true });
    },
    onError: () => showToast('We couldn’t switch workspaces. Please try again.', 'error'),
  });
}
