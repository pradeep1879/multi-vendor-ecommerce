import { type Address } from './account-api';

export type AddressDraft = Omit<Address, 'id'>;

export const emptyAddress: AddressDraft = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  district: '',
  state: '',
  stateCode: '',
  pincode: '',
  country: 'India',
  label: 'Home',
  isDefault: false,
};
