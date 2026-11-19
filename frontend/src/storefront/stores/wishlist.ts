import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../types/catalog';

type WishlistState = {
  productIds: string[];
  productsById: Record<string, Product>;
  toggle: (product: Product) => void;
};
export const useWishlist = create<WishlistState>()(
  persist(
    (set) => ({
      productIds: [],
      productsById: {},
      toggle: (product) =>
        set((state) => {
          if (state.productIds.includes(product.id)) {
            const productsById = { ...state.productsById };
            delete productsById[product.id];
            return {
              productIds: state.productIds.filter((id) => id !== product.id),
              productsById,
            };
          }
          return {
            productIds: [...state.productIds, product.id],
            productsById: { ...state.productsById, [product.id]: product },
          };
        }),
    }),
    { name: 'maison-wishlist' },
  ),
);
