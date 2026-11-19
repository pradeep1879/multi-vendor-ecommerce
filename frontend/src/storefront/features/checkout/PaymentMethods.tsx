import { CreditCard } from 'lucide-react';

export function PaymentMethods({
  value,
  onChange,
  disabled,
}: {
  value: 'RAZORPAY';
  onChange: (value: 'RAZORPAY') => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="store-payment-methods" disabled={disabled}>
      <legend>Payment method</legend>
      <p>Choose a secure online payment method at the next step.</p>
      <label>
        <input
          type="radio"
          name="payment-method"
          checked={value === 'RAZORPAY'}
          onChange={() => onChange('RAZORPAY')}
        />
        <CreditCard size={20} />
        <span>
          Pay online<small>UPI, cards and netbanking via Razorpay</small>
        </span>
      </label>
    </fieldset>
  );
}
