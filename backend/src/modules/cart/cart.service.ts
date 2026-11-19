import { AppError } from '../../common/errors/app-error';
import type { Environment } from '../../config/env';
import { CartCache, type CachedCart } from './cart.cache';
import { CartRepository } from './cart.repository';

export class CartService {
  private readonly cache: CartCache;
  constructor(
    private readonly repository = new CartRepository(),
    environment: Environment,
  ) {
    this.cache = new CartCache(environment);
  }

  async get(userId: string) {
    const cart = await this.repository.getCartMeta(userId);
    let cached = await this.cache.get(userId, cart.updatedAt);
    if (!cached) {
      const items = await this.repository.getCartItems(cart.id);
      cached = {
        updatedAt: cart.updatedAt.toISOString(),
        items: items.map(({ id, productId, variantId, quantity }) => ({
          id,
          productId,
          variantId,
          quantity,
        })),
      };
      await this.cache.set(userId, cached);
    }
    const products = await this.repository.getProductSummaries(
      cached.items.map(({ productId }) => productId),
    );
    const productById = new Map(products.map((product) => [product.id, product]));
    const items = cached.items.flatMap((item) => {
      const product = productById.get(item.productId);
      if (!product) return [];
      const variant = product.variants.find((entry) => entry.id === item.variantId);
      if (!variant) return [];
      const inventory = variant.inventory ?? product.inventory;
      const available = Math.max(0, (inventory?.onHand ?? 0) - (inventory?.reserved ?? 0));
      const availableToAdd = Math.max(0, available - item.quantity);
      const isAvailable =
        product.status === 'ACTIVE' &&
        product.category.active &&
        product.vendor.status === 'APPROVED' &&
        available >= item.quantity;
      return [
        {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          product: {
            ...product,
            sku: variant.sku,
            pricePaise: variant.pricePaise,
            compareAtPricePaise: variant.compareAtPricePaise,
            selectedVariant: variant,
            inventory,
          },
          availableToAdd,
          isAvailable,
        },
      ];
    });
    return { items };
  }

  async setQuantity(userId: string, productId: string, quantity: number, variantId?: string) {
    const result = await this.repository.setItemQuantity(userId, productId, quantity, variantId);
    if (result.kind === 'UNAVAILABLE')
      throw new AppError(
        409,
        'PRODUCT_UNAVAILABLE',
        'Product is not available to add to the cart.',
      );
    if (result.kind === 'INSUFFICIENT_STOCK')
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock.');
    await this.cache.invalidate(userId);
    return this.get(userId);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number) {
    const result = await this.repository.updateItemQuantity(userId, itemId, quantity);
    if (result.kind === 'NOT_FOUND')
      throw new AppError(404, 'NOT_FOUND', 'Cart item was not found.');
    if (result.kind === 'UNAVAILABLE')
      throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Product is no longer available.');
    if (result.kind === 'INSUFFICIENT_STOCK')
      throw new AppError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock.');
    await this.cache.invalidate(userId);
    return this.get(userId);
  }

  async remove(userId: string, itemId: string) {
    await this.repository.removeItem(userId, itemId);
    await this.cache.invalidate(userId);
  }
  async clear(userId: string) {
    await this.repository.clear(userId);
    await this.cache.invalidate(userId);
  }
  async redisAvailable() {
    return this.cache.ping();
  }
  async close() {
    await this.cache.close();
  }
}

export type CartSnapshot = CachedCart;
