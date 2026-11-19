import { currency } from '../../lib/commerce-format';

export const keys = {
  overview: ['account', 'overview'],
  profile: ['account', 'profile'],
  orders: ['account', 'orders'],
  addresses: ['account', 'addresses'],
  wishlist: ['account', 'wishlist'],
  reviews: ['account', 'reviews'],
  returns: ['account', 'returns'],
  refunds: ['account', 'refunds'],
  notifications: ['account', 'notifications'],
  preferences: ['account', 'preferences'],
};

export const price = (paise: number) => currency.format(paise / 100);

export const readable = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const statusTone = (value: string) =>
  ['DELIVERED', 'PAID', 'SUCCEEDED', 'REFUNDED', 'ACTIVE', 'PUBLISHED'].includes(value)
    ? 'bg-[#e9eee3] text-[#59634c]'
    : ['CANCELLED', 'FAILED', 'REJECTED', 'OUT_OF_STOCK'].includes(value)
      ? 'bg-[#f7e9e6] text-[#8a5147]'
      : 'bg-[#f2efe7] text-[#786b52]';
