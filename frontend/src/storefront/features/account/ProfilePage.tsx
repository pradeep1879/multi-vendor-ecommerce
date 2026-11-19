import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { accountApi, type Profile } from './account-api';
import { keys, readable } from './account-utils';
import { State, PageTitle, Panel } from './AccountUI';

export function ProfilePage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.profile,
    queryFn: accountApi.profile,
  });
  const [draft, setDraft] = useState<Pick<Profile, 'firstName' | 'lastName' | 'phone'>>({
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (query.data)
      setDraft({
        firstName: query.data.firstName,
        lastName: query.data.lastName,
        phone: query.data.phone ?? '',
      });
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: accountApi.updateProfile,
    onSuccess: (data) => {
      qc.setQueryData(keys.profile, data);
      qc.invalidateQueries({ queryKey: keys.overview });
      setNotice('Your profile has been saved.');
    },
  });
  const verification = useMutation({
    mutationFn: accountApi.requestEmailVerification,
    onSuccess: () => setNotice('If delivery is configured, a verification link has been sent.'),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    setNotice('');
    mutation.mutate({ ...draft, phone: draft.phone ?? '' });
  }
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      {query.data && (
        <>
          <PageTitle
            eyebrow="Personal information"
            title="Profile"
            description="Keep your account details current. Your email address stays protected until a verified email-change flow is available."
          />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <Panel>
              <form className="space-y-5" onSubmit={submit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    First name
                    <Input
                      required
                      value={draft.firstName}
                      maxLength={50}
                      onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    Last name
                    <Input
                      value={draft.lastName}
                      maxLength={50}
                      onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                    />
                  </label>
                </div>
                <label className="grid max-w-xl gap-2 text-sm">
                  Email address
                  <Input
                    type="email"
                    readOnly
                    value={query.data.email}
                    className="bg-store-soft text-store-muted"
                  />
                  <span className="text-sm text-store-muted">
                    Email changes require a separate verification step.
                  </span>
                </label>
                <label className="grid max-w-xl gap-2 text-sm">
                  Mobile number
                  <Input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    value={draft.phone ?? ''}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                  <span className="text-sm text-store-muted">
                    Use an Indian mobile number. Leave blank if you prefer not to add one.
                  </span>
                </label>
                {notice && (
                  <p role="status" className="text-sm text-[#59634c]">
                    {notice}
                  </p>
                )}
                <Button disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            </Panel>
            <Panel>
              <p className="text-sm uppercase tracking-[.16em] text-store-muted">
                Account information
              </p>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-store-muted">Member since</dt>
                  <dd className="mt-1">
                    {new Date(query.data.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-store-muted">Email verification</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {query.data.emailVerifiedAt ? (
                      <>
                        <Check size={14} className="text-[#59634c]" />
                        Verified
                      </>
                    ) : (
                      <>
                        <span className="text-amber-700">Not verified</span>
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          disabled={verification.isPending}
                          onClick={() => verification.mutate()}
                        >
                          {verification.isPending ? 'Sending…' : 'Resend'}
                        </button>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-store-muted">Account status</dt>
                  <dd className="mt-1">{readable(query.data.status)}</dd>
                </div>
              </dl>
            </Panel>
          </div>
        </>
      )}
    </State>
  );
}
