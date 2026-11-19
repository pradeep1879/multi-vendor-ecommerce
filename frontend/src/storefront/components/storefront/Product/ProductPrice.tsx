import { currency } from '../../../lib/commerce-format';

export function ProductPrice({
  pricePaise,
  compareAtPaise,
}: {
  pricePaise: number;
  compareAtPaise?: number | null;
}) {
  const onSale = Boolean(compareAtPaise && compareAtPaise > pricePaise);
  return (
    <div className="store-price">
      {onSale && (
        <s>
          <span className="sr-only">Regular price </span>
          {currency.format(compareAtPaise! / 100)}
        </s>
      )}
      <span>
        <span className="sr-only">{onSale ? 'Sale price ' : 'Price '}</span>
        {currency.format(pricePaise / 100)}
      </span>
    </div>
  );
}

export function ProductRating({ rating, count }: { rating: number; count: number }) {
  if (!count) return null;
  return (
    <div className="store-rating" aria-label={`${rating.toFixed(1)} out of 5, ${count} reviews`}>
      <span aria-hidden="true">
        {'★'.repeat(Math.round(rating))}
        {'☆'.repeat(5 - Math.round(rating))}
      </span>
      <span>
        {rating.toFixed(1)} ({count})
      </span>
    </div>
  );
}
