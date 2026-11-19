import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../auth/auth-state';
import { useWishlist } from '../../stores/wishlist';
import type { Product } from '../../types/catalog';

export function useWishlistToggle(product?: Product) {
  const productId = product?.id ?? '';
  const auth = useAuth();
  const queryClient = useQueryClient();
  const localIds = useWishlist((state) => state.productIds);
  const toggleLocal = useWishlist((state) => state.toggle);
  const customerSession = auth.data?.role === 'CUSTOMER';
  const serverWishlist = useQuery({
    queryKey: ['account', 'wishlist'],
    queryFn: async () =>
      (await api.get<{ data: Array<{ productId: string }> }>('/account/wishlist')).data.data,
    enabled: customerSession,
    retry: false,
  });
  const saved = customerSession
    ? Boolean(serverWishlist.data?.some((item) => item.productId === productId))
    : localIds.includes(productId);
  const mutation = useMutation({
    mutationFn: async (currentlySaved: boolean) =>
      currentlySaved
        ? api.delete(`/account/wishlist/${encodeURIComponent(productId)}`)
        : api.post(`/account/wishlist/${encodeURIComponent(productId)}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account', 'wishlist'] });
      await queryClient.invalidateQueries({ queryKey: ['account', 'overview'] });
    },
  });
  const toggle = () => {
    if (customerSession) mutation.mutate(saved);
    else if (product) toggleLocal(product);
  };
  return { saved, toggle, isPending: mutation.isPending, error: mutation.error };
}
