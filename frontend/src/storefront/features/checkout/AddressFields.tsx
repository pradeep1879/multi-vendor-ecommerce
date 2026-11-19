import { indianStates, type AddressDraft } from './address';
import type { Address } from '../account/account-api';

export function AddressFields({
  address,
  update,
  savedAddresses,
  selectedAddressId,
  selectSavedAddress,
  startNewAddress,
}: {
  address: AddressDraft;
  update: (field: keyof AddressDraft, value: string) => void;
  savedAddresses: Address[];
  selectedAddressId: string;
  selectSavedAddress: (address: Address) => void;
  startNewAddress: () => void;
}) {
  return (
    <section className="store-address-fields">
      <div className="store-checkout-section-heading">
        <h2>Order details</h2>
      </div>
      {savedAddresses.length > 0 && (
        <label className="store-saved-address-select">
          Use a saved address
          <select
            value={selectedAddressId}
            onChange={(event) => {
              const id = event.target.value;
              const saved = savedAddresses.find((item) => item.id === id);
              if (saved) selectSavedAddress(saved);
              else startNewAddress();
            }}
          >
            <option value="">Enter a new address</option>
            {savedAddresses.map((saved) => (
              <option key={saved.id} value={saved.id}>
                {saved.label}: {saved.line1}, {saved.city}{saved.isDefault ? ' · Default' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="store-form-grid">
        <label>
          Full name
          <input
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            value={address.fullName}
            onChange={(e) => update('fullName', e.target.value)}
          />
        </label>
        <label>
          Phone
          <input
            autoComplete="tel"
            required
            type="tel"
            pattern="(\+91[- ]?)?[6-9][0-9]{9}"
            value={address.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="10-digit Indian mobile"
          />
        </label>
        <label className="store-field-wide">
          Address line 1
          <input
            autoComplete="address-line1"
            required
            minLength={3}
            maxLength={160}
            value={address.line1}
            onChange={(e) => update('line1', e.target.value)}
          />
        </label>
        <label className="store-field-wide">
          Address line 2 (optional)
          <input
            autoComplete="address-line2"
            maxLength={160}
            value={address.line2}
            onChange={(e) => update('line2', e.target.value)}
          />
        </label>
        <label>
          City
          <input
            autoComplete="address-level2"
            required
            minLength={2}
            maxLength={80}
            value={address.city}
            onChange={(e) => update('city', e.target.value)}
          />
        </label>
        <label>
          State
          <select
            autoComplete="address-level1"
            required
            value={address.stateCode}
            onChange={(e) => {
              update('stateCode', e.target.value);
              update('state', indianStates.find(([, code]) => code === e.target.value)?.[0] ?? '');
            }}
          >
            <option value="">Select state</option>
            {indianStates.map(([name, code]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          PIN code
          <input
            autoComplete="postal-code"
            required
            inputMode="numeric"
            pattern="[1-9][0-9]{5}"
            value={address.pincode}
            onChange={(e) => update('pincode', e.target.value)}
          />
        </label>
        <label>
          Country
          <input value="India" readOnly autoComplete="country-name" />
        </label>
      </div>
    </section>
  );
}
