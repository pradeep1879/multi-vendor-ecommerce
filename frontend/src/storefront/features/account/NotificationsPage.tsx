import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/button';
import { accountApi } from './account-api';
import { keys, readable } from './account-utils';
import { State, PageTitle, Empty, Pager } from './AccountUI';

export function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: [...keys.notifications, page],
    queryFn: () => accountApi.notifications(page),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: keys.notifications });
  const mark = useMutation({
    mutationFn: accountApi.markRead,
    onSuccess: refresh,
  });
  const all = useMutation({
    mutationFn: accountApi.markAllRead,
    onSuccess: refresh,
  });
  return (
    <State loading={query.isLoading} error={query.isError} retry={() => void query.refetch()}>
      <PageTitle
        eyebrow="A note from the Maison"
        title="Notifications"
        description="Order and account updates, all in one place."
        action={
          Boolean(query.data?.unread) && (
            <Button variant="outline" disabled={all.isPending} onClick={() => all.mutate()}>
              {all.isPending ? 'Marking read…' : 'Mark all read'}
            </Button>
          )
        }
      />
      {query.data?.items.length ? (
        <div className="space-y-2">
          {query.data.items.map((item) => (
            <article
              key={item.id}
              className={`border p-4 ${item.readAt ? 'border-store-line bg-white' : 'border-store-line bg-store-soft'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] uppercase tracking-wider text-store-muted">
                      {readable(item.type)}
                    </span>
                    {!item.readAt && (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#68745a]" aria-label="Unread" />
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-medium">{item.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-store-muted">{item.body}</p>
                  <p className="mt-2 text-sm text-store-muted">
                    {new Date(item.createdAt).toLocaleString('en-IN')}
                  </p>
                  {item.href && (
                    <Link
                      to={item.href}
                      className="mt-2 inline-flex text-sm underline underline-offset-4"
                    >
                      View details
                    </Link>
                  )}
                </div>
                {!item.readAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate(item.id)}
                  >
                    {mark.isPending && mark.variables === item.id ? 'Marking…' : 'Mark read'}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="All caught up"
          description="New order and account updates will appear here."
        />
      )}
      <Pager page={page} pages={query.data?.pagination.pages ?? 0} onPage={setPage} />
    </State>
  );
}
