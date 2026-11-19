export const indianStates: Array<[string, string]> = [
  ['Andhra Pradesh', '37'],
  ['Assam', '18'],
  ['Bihar', '10'],
  ['Delhi', '07'],
  ['Goa', '30'],
  ['Gujarat', '24'],
  ['Haryana', '06'],
  ['Karnataka', '29'],
  ['Kerala', '32'],
  ['Madhya Pradesh', '23'],
  ['Maharashtra', '27'],
  ['Odisha', '21'],
  ['Punjab', '03'],
  ['Rajasthan', '08'],
  ['Tamil Nadu', '33'],
  ['Telangana', '36'],
  ['Uttar Pradesh', '09'],
  ['Uttarakhand', '05'],
  ['West Bengal', '19'],
];
export type AddressDraft = {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
};
