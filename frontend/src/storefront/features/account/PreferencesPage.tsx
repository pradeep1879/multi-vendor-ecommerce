import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi } from './account-api';
import { keys } from './account-utils';
import { State, PageTitle, Panel } from './AccountUI';

export function PreferencesPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.preferences,
    queryFn: accountApi.preferences,
  });
  const update = useMutation({
    mutationFn: (data: Record<string, boolean>) => accountApi.updatePreferences(data),
    onSuccess: (data) => qc.setQueryData(keys.preferences, data),
  });
  const fields: [keyof NonNullable<typeof query.data>, string, string][] = [
    [
      'orderUpdatesEmail',
      'Order updates',
      'Receipts, fulfillment, and delivery updates are transactional and always remain on.',
    ],
    ['promotionalEmail', 'Promotional emails', 'Product launches, offers, and seasonal notes.'],
    ['recommendationsEmail', 'Product recommendations', 'Beauty picks based on your interests.'],
  ];
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="Your inbox, your choice"
        title="Preferences"
        description="Choose which optional email updates you’d like to receive."
      />
      <Panel>
        <div className="divide-y divide-store-line">
          {fields.map(([key, label, description]) => (
            <label
              key={key}
              className="flex cursor-pointer items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <span>
                <strong className="block text-sm font-medium">{label}</strong>
                <span className="mt-1 block max-w-lg text-sm leading-5 text-store-muted">
                  {description}
                </span>
              </span>
              <input
                aria-label={label}
                type="checkbox"
                checked={query.data?.[key] ?? false}
                disabled={key === 'orderUpdatesEmail' || update.isPending}
                onChange={(e) => update.mutate({ [key]: e.target.checked })}
                className="mt-1 h-4 w-4 accent-[#68745a]"
              />
            </label>
          ))}
        </div>
        <p className="mt-5 border-t border-store-line pt-4 text-sm leading-5 text-store-muted">
          Transactional emails about orders, refunds, and account security remain enabled for
          important service and safety updates.
        </p>
      </Panel>
    </State>
  );
}
