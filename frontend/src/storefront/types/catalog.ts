export type Product = {
  id: string;
  variantId?: string;
  variantName?: string;
  sku?: string;
  name: string;
  slug: string;
  type: string;
  shortDescription: string;
  brand: { name: string };
  vendorName?: string;
  pricePaise: number;
  compareAtPaise?: number;
  image: string;
  availableQuantity?: number;
  label?: string;
  rating: number;
  reviewCount: number;
};

export type CatalogVariant = {
  id: string;
  name: string;
  sku: string;
  pricePaise: number;
  compareAtPaise: number | null;
  availableQuantity: number;
  reservedQuantity: number;
  attributes?: Record<string, unknown>;
  images?: Array<{ url: string; alt?: string }>;
};
export type CatalogProduct = Product & {
  description?: string;
  ingredients?: string[];
  benefits?: string[];
  howToUse?: string | null;
  warnings?: string | null;
  images?: Array<{ url: string; alt?: string }>;
  variants: CatalogVariant[];
  categories?: Array<{ category: { name: string; slug: string } }>;
  averageRating?: number | null;
  reviews?: Array<{
    id: string;
    rating: number;
    title?: string | null;
    comment: string;
    verified: boolean;
    createdAt: string;
    user: { name: string };
  }>;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
};
