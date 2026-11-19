import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { StoreShell } from '../components/storefront/StoreShell';
import { StoreStatus } from '../components/storefront/StoreStatus';
import { normalizeProduct } from '../features/products/catalog';
import { ProductGallery } from '../features/products/detail/ProductGallery';
import { ProductPurchase } from '../features/products/detail/ProductPurchase';
import { ProductInformation, ProductReviews } from '../features/products/detail/ProductInformation';
import { RelatedProducts } from '../features/products/detail/RelatedProducts';
import type { CatalogProduct } from '../types/catalog';

function ProductDetailSkeleton() {
  return (
    <div className="store-product-skeleton" role="status" aria-label="Loading product details">
      <span className="sr-only">Loading product details</span>
      <div className="store-product-skeleton-breadcrumb">
        <i /> <i /> <i />
      </div>
      <div className="store-product-layout">
        <div className="store-product-skeleton-gallery">
          <i />
          <div>
            {Array.from({ length: 4 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        </div>
        <div className="store-product-skeleton-purchase">
          <i className="short" />
          <i className="title" />
          <i className="title second" />
          <i className="price" />
          <i />
          <i className="description" />
          <i className="description shorter" />
          <i className="option" />
          <i className="button" />
          <i className="button secondary" />
        </div>
      </div>
      <div className="store-product-skeleton-lower">
        <i />
        <i />
        <i className="short" />
      </div>
    </div>
  );
}

function ProductContent({ product }: { product: CatalogProduct }) {
  const [variantId, setVariantId] = useState('');
  const variant =
    product.variants.find((item) => item.id === variantId) ??
    product.variants.find((item) => item.availableQuantity > item.reservedQuantity) ??
    product.variants[0];
  const sourceImages = [...(variant?.images ?? []), ...(product.images ?? [])];
  const gallery = sourceImages.filter(
    (image, index) => sourceImages.findIndex((item) => item.url === image.url) === index,
  );
  if (!gallery.length && product.image) gallery.push({ url: product.image, alt: product.name });
  useEffect(() => {
    document.title = `${product.name} | Maison Beauté`;
  }, [product.name]);
  return (
    <>
      <nav className="store-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/products">Products</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>
      <div className="store-product-layout">
        <ProductGallery key={variant?.id} name={product.name} images={gallery} />
        {variant ? (
          <ProductPurchase product={product} variant={variant} onVariant={setVariantId} />
        ) : (
          <StoreStatus title={product.name}>This product is currently unavailable.</StoreStatus>
        )}
      </div>
      <ProductInformation product={product} />
      <ProductReviews product={product} />
      <RelatedProducts product={product} />
    </>
  );
}

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const query = useQuery({
    queryKey: ['product', slug],
    queryFn: async () =>
      (
        await api.get<{ data: { product: Record<string, unknown> } }>(
          `/products/${encodeURIComponent(slug)}`,
        )
      ).data.data.product,
    retry: false,
    enabled: Boolean(slug),
  });
  return (
    <StoreShell>
      <div className="store-container store-product-page">
        {query.isLoading && <ProductDetailSkeleton />}
        {query.isError && (
          <div className="flex flex-wrap justify-center gap-3 py-8">
            <button className="button button-dark" onClick={() => void query.refetch()}>
              Retry
            </button>
            <Link className="button button-outline" to="/products">
              Back to products
            </Link>
          </div>
        )}
        {query.data && <ProductContent key={slug} product={normalizeProduct(query.data)} />}
      </div>
    </StoreShell>
  );
}
