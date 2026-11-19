import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { MapPin } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { accountApi, type Address } from './account-api';
import { showToast } from '../../../components/feedback/toast';
import { keys } from './account-utils';
import { State, PageTitle, Panel } from './AccountUI';
import { type AddressDraft, emptyAddress } from './address-draft';

function addressSaveError(reason: unknown) {
  if (!axios.isAxiosError<{ error?: { message?: string; details?: Array<{ field: string; issue: string }> } }>(reason))
    return 'We couldn’t save this address. Please check the details and try again.';

  const error = reason.response?.data?.error;
  const fields = error?.details?.map(({ field, issue }) => {
    const key = field.replace(/^(body\.)/, '');
    const labels: Record<string, string> = {
      recipient: 'Full name',
      phone: 'Phone',
      line1: 'Address line 1',
      line2: 'Address line 2',
      locality: 'Landmark',
      city: 'City',
      region: 'State',
      postalCode: 'Pincode',
      countryCode: 'Country',
      isDefault: 'Default address',
    };
    return `${labels[key] ?? key}: ${issue}`;
  });

  if (fields?.length) return fields.join(' ');
  return error?.message ?? 'We couldn’t save this address. Please try again.';
}

export function AddressesPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.addresses,
    queryFn: accountApi.addresses,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress);
  const [error, setError] = useState('');
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error]);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.addresses });
  const save = useMutation({
    mutationFn: () =>
      editing ? accountApi.updateAddress(editing, draft) : accountApi.addAddress(draft),
    onSuccess: () => {
      setDraft({ ...emptyAddress });
      setEditing(null);
      setShowForm(false);
      setError('');
      void refresh();
    },
    onError: (reason) => setError(addressSaveError(reason)),
  });
  const remove = useMutation({
    mutationFn: accountApi.removeAddress,
    onSuccess: () => void refresh(),
  });
  const makeDefault = useMutation({
    mutationFn: accountApi.defaultAddress,
    onSuccess: () => void refresh(),
  });
  function begin(address?: Address) {
    setEditing(address?.id ?? null);
    setShowForm(true);
    setDraft(
      address
        ? {
            fullName: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            district: address.district,
            state: address.state,
            stateCode: address.stateCode,
            pincode: address.pincode,
            country: 'India',
            label: address.label,
            isDefault: address.isDefault,
          }
        : { ...emptyAddress },
    );
    setError('');
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    save.mutate();
  }
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="Delivery details"
        title="Addresses"
        description="Save a few trusted places for your future orders."
        action={
          <Button variant="outline" onClick={() => begin()}>
            Add address
          </Button>
        }
      />
      {showForm ? (
        <Panel className="mb-5">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <h3 className="font-store text-xl sm:col-span-2">
              {editing ? 'Edit address' : 'Add a new address'}
            </h3>
            {error && (
              <p className="sm:col-span-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
            {(
              [
                ['Full name', 'fullName'],
                ['Phone', 'phone'],
                ['Address line 1', 'line1'],
                ['Address line 2 (optional)', 'line2'],
                ['Landmark (optional)', 'landmark'],
                ['City', 'city'],
                ['District (optional)', 'district'],
                ['State', 'state'],
                ['State code (2 digits)', 'stateCode'],
                ['Pincode', 'pincode'],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="grid gap-1 text-sm">
                {label}
                <Input
                  required={!['line2', 'landmark', 'district'].includes(key)}
                  maxLength={160}
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="grid gap-1 text-sm">
              Address type
              <select
                className="h-10 border border-store-line bg-white px-3 text-sm"
                value={draft.label}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    label: e.target.value as AddressDraft['label'],
                  })
                }
              >
                <option>Home</option>
                <option>Work</option>
                <option>Other</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isDefault}
                onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
              />{' '}
              Make this my default
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save address'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setShowForm(false);
                  setDraft({ ...emptyAddress });
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
      {query.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {query.data.map((address) => (
            <Panel key={address.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm uppercase tracking-wider text-store-muted">
                    {address.label}
                  </span>
                  {address.isDefault && (
                    <span className="ml-2 text-sm text-[#59634c]">Default</span>
                  )}
                  <h3 className="mt-2 text-sm font-medium">{address.fullName}</h3>
                  <p className="mt-1 text-sm leading-5 text-store-muted">
                    {address.line1}
                    {address.line2 && `, ${address.line2}`}
                    <br />
                    {address.city}
                    {address.district ? `, ${address.district}` : ''}, {address.state}{' '}
                    {address.pincode}
                    <br />
                    {address.phone}
                  </p>
                </div>
                <MapPin size={17} className="text-store-muted" />
              </div>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-store-line pt-4 text-sm">
                <button onClick={() => begin(address)} className="underline underline-offset-4">
                  Edit
                </button>
                {!address.isDefault && (
                  <button
                    disabled={makeDefault.isPending || remove.isPending}
                    onClick={() => makeDefault.mutate(address.id)}
                    className="underline underline-offset-4"
                  >
                    {makeDefault.isPending && makeDefault.variables === address.id
                      ? 'Updating…'
                      : 'Make default'}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (window.confirm('Remove this saved address?')) remove.mutate(address.id);
                  }}
                  className="text-[#8a5147] underline underline-offset-4"
                  disabled={remove.isPending || makeDefault.isPending}
                >
                  {remove.isPending && remove.variables === address.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : !showForm ? (
        <div className="border border-dashed border-store-line bg-white/70 px-5 py-12 text-center">
          <p className="font-store text-2xl">No saved addresses</p>
          <p className="mt-2 text-sm text-store-muted">Add an address for a faster checkout.</p>
          <Button className="mt-5" onClick={() => begin()}>
            Add address
          </Button>
        </div>
      ) : null}
    </State>
  );
}
