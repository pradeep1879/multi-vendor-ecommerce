import { StoreShell } from '../components/storefront/StoreShell';
import { Hero } from '../features/home/Hero';
import { HomeCollections } from '../features/home/HomeCollections';
import { Story, StoreBenefits } from '../features/home/EditorialSections';

export function StorefrontPage() {
  return (
    <StoreShell>
      <Hero />
      <HomeCollections />
      <Story />
      <StoreBenefits />
    </StoreShell>
  );
}
