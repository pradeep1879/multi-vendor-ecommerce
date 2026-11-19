import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { useAuth } from '../../../features/auth/auth-state';
import { useCartView } from '../../../features/cart/use-cart-view';
import { useWishlist } from '../../../stores/wishlist';

export type StoreCategory = {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  productCount: number;
};
export function useCategories() {
  return useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () => (await api.get<{ data: StoreCategory[] }>('/categories')).data.data,
    retry: false,
  });
}
export function useHeaderData() {
  const { lines } = useCartView();
  const auth = useAuth();
  const savedCount = useWishlist((state) => state.productIds.length);
  const wishlist = useQuery({
    queryKey: ['account', 'wishlist'],
    queryFn: async () =>
      (await api.get<{ data: Array<{ productId: string }> }>('/account/wishlist')).data.data,
    enabled: auth.data?.role === 'CUSTOMER',
    retry: false,
  });
  return {
    count: Object.values(lines).reduce((sum, item) => sum + item.quantity, 0),
    favoriteCount: auth.data?.role === 'CUSTOMER' ? (wishlist.data?.length ?? 0) : savedCount,
  };
}
