import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Overlay } from '../../components/storefront/Overlay';

type Category = { id: string; name: string; slug: string };
export function CollectionFilters({
  params,
  categories,
  categoriesLoading = false,
  update,
  clear,
}: {
  params: URLSearchParams;
  categories: Category[];
  categoriesLoading?: boolean;
  update: (name: string, value: string) => void;
  clear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = ['category', 'minPrice', 'maxPrice', 'brand', 'inStock'].filter((key) =>
    params.get(key),
  ).length;
  return (
    <>
      <button className="store-filter-trigger" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={18} />
        Filter{count ? ` (${count})` : ''}
      </button>
      <Overlay open={open} onClose={() => setOpen(false)} title="Filter products" side="left">
        <div className="store-filter-fields">
          <label>
            Category
            <select
              disabled={categoriesLoading}
              value={params.get('category') ?? ''}
              onChange={(event) => update('category', event.target.value)}
            >
              <option value="">{categoriesLoading ? 'Loading categories…' : 'All products'}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Price (₹)</legend>
            <div className="store-price-fields">
              <label>
                From
                <input
                  type="number"
                  min="0"
                  value={params.get('minPrice') ?? ''}
                  onChange={(event) => update('minPrice', event.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                To
                <input
                  type="number"
                  min="0"
                  value={params.get('maxPrice') ?? ''}
                  onChange={(event) => update('maxPrice', event.target.value)}
                  placeholder="No limit"
                />
              </label>
            </div>
          </fieldset>
          <label>
            Brand
            <input
              value={params.get('brand') ?? ''}
              onChange={(event) => update('brand', event.target.value)}
              placeholder="Search a brand"
            />
          </label>
          <label className="store-checkbox">
            <input
              type="checkbox"
              checked={params.get('inStock') === 'true'}
              onChange={(event) => update('inStock', event.target.checked ? 'true' : '')}
            />
            In stock only
          </label>
          <button className="button button-dark" onClick={() => setOpen(false)}>
            Show products
          </button>
          <button className="store-text-button" onClick={clear}>
            Clear all filters
          </button>
        </div>
      </Overlay>
    </>
  );
}
