import type { CatalogProduct } from '../../types/catalog';

export function normalizeProduct(raw: Record<string, unknown>): CatalogProduct {
  const variants = ((raw.variants as Array<Record<string, unknown>> | undefined) ?? []).map(
    (variant) => {
      const inventory = (variant.inventory ?? {}) as Record<string, unknown>;
      return {
        id: String(variant.id ?? ''),
        name: String(variant.name ?? ''),
        sku: String(variant.sku ?? ''),
        pricePaise: Number(variant.pricePaise ?? 0),
        compareAtPaise:
          variant.compareAtPricePaise == null ? null : Number(variant.compareAtPricePaise),
        availableQuantity: Number(inventory.onHand ?? 0),
        reservedQuantity: Number(inventory.reserved ?? 0),
      };
    },
  );
  const images = (raw.images as CatalogProduct['images'] | undefined) ?? [];
  const brand = raw.brand as { name?: string } | undefined;
  const vendor = raw.vendor as { name?: string } | undefined;
  const chosen =
    variants.find((variant) => variant.availableQuantity > variant.reservedQuantity) ?? variants[0];
  return {
    id: String(raw.id ?? ''),
    variantId: chosen?.id ?? '',
    variantName: chosen?.name ?? '',
    sku: chosen?.sku ?? '',
    slug: String(raw.slug ?? ''),
    name: String(raw.name ?? ''),
    type: String((raw.category as { name?: string } | undefined)?.name ?? ''),
    shortDescription: String(raw.shortDescription ?? raw.description ?? ''),
    brand: { name: brand?.name ?? '' },
    vendorName: vendor?.name,
    pricePaise: Number(chosen?.pricePaise ?? raw.pricePaise ?? 0),
    compareAtPaise: chosen?.compareAtPaise ?? undefined,
    image: images[0]?.url ?? '',
    availableQuantity: chosen ? Math.max(0, chosen.availableQuantity - chosen.reservedQuantity) : 0,
    rating: Number(raw.averageRating ?? 0),
    reviewCount: Number(raw.reviewCount ?? 0),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    ingredients: raw.ingredients as string[] | undefined,
    benefits: raw.benefits as string[] | undefined,
    howToUse: typeof raw.howToUse === 'string' ? raw.howToUse : null,
    warnings: typeof raw.warnings === 'string' ? raw.warnings : null,
    images,
    variants,
    categories: raw.categories as CatalogProduct['categories'],
    averageRating: typeof raw.averageRating === 'number' ? raw.averageRating : null,
    reviews: raw.reviews as CatalogProduct['reviews'],
  };
}

export function discountPercent(price: number, compareAt?: number | null) {
  return compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
}
