import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CartLine } from '../../stores/cart';
import { useCart } from '../../stores/cart';
import { useAuth } from '../auth/auth-state';

type ServerCart = { items: Array<{ variantId: string; quantity: number }> };
export function useAddToCart() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const localLines = useCart((state) => state.lines);
  const addLocal = useCart((state) => state.add);
  const setOpen = useCart((state) => state.setOpen);
  useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<{ data: ServerCart }>('/cart')).data.data,
    enabled: auth.data?.role === 'CUSTOMER',
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async ({ line, amount }: { line: Omit<CartLine, 'quantity'>; amount: number }) => {
      if (auth.data?.role === 'CUSTOMER') {
        const cart = await queryClient.ensureQueryData({
          queryKey: ['cart'],
          queryFn: async () => (await api.get<{ data: ServerCart }>('/cart')).data.data,
        });
        const quantity =
          (cart.items.find((item) => item.variantId === line.variantId)?.quantity ?? 0) + amount;
        await api.put('/cart/items', {
          productId: line.product.id,
          variantId: line.variantId,
          quantity,
        });
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
      }
      if (auth.data?.role !== 'CUSTOMER') addLocal(line, amount);
    },
    onSuccess: () => setOpen(true),
  });
  const add = (line: Omit<CartLine, 'quantity'>, amount = 1) => mutation.mutate({ line, amount });
  return { add, isPending: mutation.isPending, error: mutation.error, localLines };
}
