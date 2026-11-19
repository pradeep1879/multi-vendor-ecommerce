import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../api/client';
import type { CartLine } from '../../stores/cart';
import { useCart } from '../../stores/cart';
import { useAuth } from '../auth/auth-state';
import type { Product } from '../../types/catalog';

type ServerCart = {
  items: Array<{
    variantId: string;
    quantity: number;
    variant: {
      id: string;
      name: string;
      sku: string;
      pricePaise: number;
      compareAtPaise: number | null;
      availableQuantity: number;
      reservedQuantity: number;
      product: {
        id: string;
        slug: string;
        name: string;
        type: string;
        shortDescription: string | null;
        brand: { name: string };
        images: Array<{ url: string }>;
      };
    };
  }>;
};

export function useCartView() {
  const auth = useAuth();
  const localLines = useCart((state) => state.lines);
  const setQuantity = useCart((state) => state.setQuantity);
  const removeLocal = useCart((state) => state.remove);
  const clearLocal = useCart((state) => state.clear);
  const queryClient = useQueryClient();
  const merging = useRef(false);
  const serverQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<{ data: ServerCart }>('/cart')).data.data,
    enabled: auth.data?.role === 'CUSTOMER',
    retry: false,
  });
  const serverLines: Record<string, CartLine> = {};
  for (const item of serverQuery.data?.items ?? []) {
    const variant = item.variant;
    const productData = variant.product;
    const product: Product = {
      id: productData.id,
      variantId: variant.id,
      slug: productData.slug,
      name: productData.name,
      type: productData.type,
      shortDescription: productData.shortDescription ?? '',
      brand: productData.brand,
      pricePaise: variant.pricePaise,
      compareAtPaise: variant.compareAtPaise ?? undefined,
      image: productData.images[0]?.url ?? '',
      availableQuantity: Math.max(0, variant.availableQuantity - variant.reservedQuantity),
      rating: 0,
      reviewCount: 0,
    };
    serverLines[variant.id] = {
      product,
      variantId: variant.id,
      variantName: variant.name,
      sku: variant.sku,
      pricePaise: variant.pricePaise,
      compareAtPaise: variant.compareAtPaise,
      availableQuantity: product.availableQuantity ?? 0,
      quantity: item.quantity,
    };
  }
  const isCustomer = auth.data?.role === 'CUSTOMER';
  useEffect(() => {
    if (
      !isCustomer ||
      !auth.data?.id ||
      !serverQuery.isSuccess ||
      !Object.keys(localLines).length ||
      merging.current
    )
      return;
    merging.current = true;
    void (async () => {
      try {
        for (const line of Object.values(localLines)) {
          const existing =
            serverQuery.data.items.find((item) => item.variantId === line.variantId)?.quantity ?? 0;
          await api.put('/cart/items', {
            productId: line.product.id,
            variantId: line.variantId,
            quantity: Math.min(10, existing + line.quantity),
          });
        }
        clearLocal();
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
      } catch {
        // Keep the guest bag available if inventory changed during sign-in.
      } finally {
        merging.current = false;
      }
    })();
  }, [
    isCustomer,
    auth.data?.id,
    serverQuery.isSuccess,
    serverQuery.data,
    localLines,
    clearLocal,
    queryClient,
  ]);
  const lines =
    isCustomer && serverQuery.isSuccess
      ? Object.fromEntries(
          Object.entries({ ...localLines, ...serverLines }).map(([id, line]) => {
            const guestQuantity = localLines[id]?.quantity ?? 0;
            const serverQuantity = serverLines[id]?.quantity ?? 0;
            return [id, { ...line, quantity: guestQuantity + serverQuantity }];
          }),
        )
      : localLines;
  const changeQuantity = (variantId: string, quantity: number) => {
    if (isCustomer && serverLines[variantId]) {
      const request =
        quantity < 1
          ? api.delete(`/cart/items/${encodeURIComponent(variantId)}`)
          : api.patch(`/cart/items/${encodeURIComponent(variantId)}`, { quantity });
      void request.then(() => serverQuery.refetch()).catch(() => serverQuery.refetch());
    } else setQuantity(variantId, quantity);
  };
  const remove = (variantId: string) => {
    if (isCustomer)
      void api
        .delete(`/cart/items/${encodeURIComponent(variantId)}`)
        .then(() => serverQuery.refetch());
    removeLocal(variantId);
  };
  return {
    lines,
    isLoading: isCustomer && serverQuery.isLoading,
    error: serverQuery.error,
    changeQuantity,
    remove,
  };
}
