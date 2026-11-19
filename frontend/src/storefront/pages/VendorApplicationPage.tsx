import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

type Application = { status: string; businessName: string; decisionReason?: string | null };

export function VendorApplicationPage() {
  const existing = useQuery({
    queryKey: ['vendor-application', 'me'],
    queryFn: async () =>
      (await api.get<{ data: { application: Application | null } }>('/vendor-applications/me')).data
        .data.application,
  });
  const [form, setForm] = useState({
    businessName: '',
    legalName: '',
    contactEmail: '',
    contactPhone: '',
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post('/vendor-applications', form)).data.data.application,
  });
  const application = submit.data ?? existing.data;
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit.mutate();
  };

  return (
    <main className="seller-application">
      <div className="seller-application-inner">
        <Link to="/" className="seller-back">
          ← Back to Aster Market
        </Link>
        <span className="seller-eyebrow">Aster Market · seller application</span>
        <h1>Make room for your good things.</h1>
        <p className="seller-intro">
          Tell us about your business. Our team will review your application before your store can
          start selling.
        </p>
        {existing.isLoading ? (
          <div
            className="seller-status seller-loading"
            role="status"
            aria-label="Checking your vendor application"
          >
            <i />
            <i />
            <i />
          </div>
        ) : application ? (
          <div className="seller-status">
            <b>Application {application.status.toLowerCase()}</b>
            <p>
              {application.businessName} ·{' '}
              {application.decisionReason || 'You can check back here for updates.'}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="seller-form">
            <label>
              Business name
              <input
                required
                minLength={2}
                maxLength={200}
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              />
            </label>
            <label>
              Legal name
              <input
                required
                minLength={2}
                maxLength={200}
                value={form.legalName}
                onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              />
            </label>
            <div className="seller-form-row">
              <label>
                Contact email
                <input
                  required
                  type="email"
                  maxLength={320}
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </label>
              <label>
                Phone
                <input
                  required
                  minLength={7}
                  maxLength={32}
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </label>
            </div>
            <button disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Submit application'} <span>→</span>
            </button>
          </form>
        )}
      </div>
      <style>{`.seller-application{min-height:76vh;padding:60px 24px;background:#f7f6f3;color:#1b1b19}.seller-application-inner{max-width:780px;margin:auto;padding:52px 60px;background:#fff;border:1px solid #e8e5df}.seller-back{display:inline-block;margin-bottom:52px;color:#666;font-size:13px;text-decoration:none}.seller-eyebrow{display:block;margin-bottom:12px;color:#8a6b5c;font-size:10px;font-weight:700;letter-spacing:1.7px}.seller-application h1{max-width:560px;margin:0;font-family:Georgia,serif;font-size:clamp(34px,5vw,53px);font-weight:400;letter-spacing:-1.2px;line-height:1.08}.seller-intro{max-width:560px;margin:17px 0 30px;color:#73736e;font-size:14px;line-height:1.7}.seller-form label{display:block;margin-bottom:17px;color:#555;font-size:11px;font-weight:600}.seller-form input{width:100%;height:45px;display:block;margin-top:7px;padding:0 12px;border:1px solid #dcdad5;border-radius:0;background:white;color:#242421;outline-color:#9d7868;font-size:13px}.seller-form-row{display:grid;grid-template-columns:1fr 1fr;gap:15px}.seller-form button{width:100%;height:48px;display:flex;align-items:center;justify-content:center;gap:14px;margin-top:4px;border:0;background:#171715;color:#fff;font-size:13px;font-weight:600}.seller-form button:disabled{opacity:.65}.seller-status{padding:18px;border:1px solid #e8e5df;background:#faf9f7;color:#343430}.seller-status b{font-size:15px}.seller-status p,.seller-error{color:#777;font-size:13px;line-height:1.6}.seller-error{color:#b34e4e}@media(max-width:600px){.seller-application{padding:18px 12px}.seller-application-inner{padding:28px 20px}.seller-back{margin-bottom:38px}.seller-form-row{grid-template-columns:1fr;gap:0}}`}</style>
    </main>
  );
}
