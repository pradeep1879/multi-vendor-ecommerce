import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product } from '../types/catalog';

export type CartLine = {
  product: Product;
  variantId: string;
  cartItemId?: string;
  variantName: string;
  sku: string;
  pricePaise: number;
  compareAtPaise: number | null;
  availableQuantity: number;
  quantity: number;
};
type CartState = {
  lines: Record<string, CartLine>;
  isOpen: boolean;
  add: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
};
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: {},
      isOpen: false,
      add: (line, quantity = 1) =>
        set((state) => {
          const existing = state.lines[line.variantId];
          return {
            lines: {
              ...state.lines,
              [line.variantId]: {
                ...line,
                quantity: Math.min(line.availableQuantity, (existing?.quantity ?? 0) + quantity),
              },
            },
          };
        }),
      setQuantity: (variantId, quantity) =>
        set((state) => {
          const line = state.lines[variantId];
          if (!line) return state;
          if (quantity < 1) {
            const lines = { ...state.lines };
            delete lines[variantId];
            return { lines };
          }
          return {
            lines: {
              ...state.lines,
              [variantId]: { ...line, quantity: Math.min(quantity, line.availableQuantity) },
            },
          };
        }),
      remove: (variantId) =>
        set((state) => {
          const lines = { ...state.lines };
          delete lines[variantId];
          return { lines };
        }),
      clear: () => set({ lines: {} }),
      setOpen: (isOpen) => set({ isOpen }),
    }),
    { name: 'maison-cart-ui', partialize: ({ lines }) => ({ lines, isOpen: false }) },
  ),
);
