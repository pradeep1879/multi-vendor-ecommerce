import { indianStates, type AddressDraft } from './address';

export function AddressFields({
  address,
  update,
}: {
  address: AddressDraft;
  update: (field: keyof AddressDraft, value: string) => void;
}) {
  return (
    <section className="store-address-fields">
      <div className="store-checkout-section-heading">
        <h2>Order details</h2>
      </div>
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
