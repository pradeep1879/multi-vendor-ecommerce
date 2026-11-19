import { StoreShell } from '../components/storefront/StoreShell';
import { ProductGrid } from '../features/products/ProductGrid';

export function ProductListingPage() {
  return (
    <StoreShell>
      <ProductGrid listing />
    </StoreShell>
  );
}
