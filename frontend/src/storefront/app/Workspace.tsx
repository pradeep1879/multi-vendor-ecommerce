import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { api, setStorefrontAccessToken } from '../api/client';
import { showToast } from '../../components/feedback/toast';
import { useAuth } from '../features/auth/auth-state';
import {
  canAccessWorkspace,
  nextVendorOrderAction,
  workspaceHome,
  type WorkspaceRole,
} from './workspace-access';
import './workspace.css';

type Role = WorkspaceRole;
// Admin/vendor endpoints return heterogeneous resource DTOs. Keep that
// flexibility at this single rendering boundary; mutation bodies stay typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonField = any;
type Row = Record<string, JsonField>;
type MutationBody = Record<string, unknown>;
const money = (paise: unknown) =>
  `₹${(Number(paise ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const pretty = (value: unknown) =>
  String(value ?? '—')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const unwrap = (body: JsonField, key?: string): JsonField => (key ? body?.data?.[key] : body?.data);
const monthBounds = (date = new Date()) => {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
};

const adminNavigation = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Sales & orders', path: '/admin/orders', icon: ShoppingCart },
  { label: 'Product review', path: '/admin/products', icon: PackageCheck },
  { label: 'Categories', path: '/admin/categories', icon: Boxes, group: 'Management' },
  { label: 'Vendor applications', path: '/admin/vendors', icon: Users },
  { label: 'Customers', path: '/admin/customers', icon: Users, group: 'Management' },
  { label: 'Returns', path: '/admin/returns', icon: RotateCcw },
  { label: 'Reviews', path: '/admin/reviews', icon: BadgeCheck },
  { label: 'Coupons', path: '/admin/coupons', icon: Tag, group: 'Commerce' },
  { label: 'Settlements', path: '/admin/settlements', icon: Banknote },
  { label: 'Reconciliation', path: '/admin/reconciliation', icon: Activity },
];
const vendorNavigation = [
  { label: 'Dashboard', path: '/vendor/dashboard', icon: LayoutDashboard },
  { label: 'Sales & orders', path: '/vendor/orders', icon: ShoppingCart },
  { label: 'Returns', path: '/vendor/returns', icon: RotateCcw },
  { label: 'Products', path: '/vendor/products', icon: Package, group: 'Store management' },
  { label: 'Inventory', path: '/vendor/inventory', icon: Boxes },
  { label: 'Settlements', path: '/vendor/settlements', icon: Banknote, group: 'Finance' },
  { label: 'Store profile', path: '/vendor/profile', icon: Store },
];

export function WorkspaceGate({ role }: { role: Role }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading)
    return (
      <div className="workspace-loading" role="status">
        <span className="workspace-spinner" /> Loading your workspace…
      </div>
    );
  if (!auth.data)
    return (
      <Navigate
        to={role === 'ADMIN' ? '/admin/login' : '/vendor/login'}
        replace
        state={{ from: location.pathname }}
      />
    );
  if (!canAccessWorkspace(role, auth.data.role))
    return <Navigate to={workspaceHome(auth.data.role)} replace />;
  return <Workspace role={role} />;
}

function Workspace({ role }: { role: Role }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [periodDate, setPeriodDate] = useState(() => new Date().toISOString().slice(0, 7));
  const admin = role === 'ADMIN';
  const items = admin ? adminNavigation : vendorNavigation;
  const page = location.pathname.replace(/\/$/, '') || `/${role.toLowerCase()}`;
  const dashboardPath = admin ? '/admin' : '/vendor';
  const endpoint = useMemo(() => {
    if (page === dashboardPath || page === `${dashboardPath}/dashboard`) return 'overview';
    return page.slice(dashboardPath.length + 1);
  }, [dashboardPath, page]);
  const bounds = useMemo(() => monthBounds(new Date(`${periodDate}-01T00:00:00Z`)), [periodDate]);
  const summary = useQuery({
    queryKey: [role, 'analytics', bounds],
    queryFn: async () =>
      unwrap(
        (await api.get(`/${role.toLowerCase()}/analytics/summary`, { params: bounds })).data,
        'summary',
      ),
    enabled: endpoint === 'overview',
  });
  const data = useQuery({
    queryKey: [role, endpoint],
    enabled: endpoint !== 'overview',
    queryFn: async () => {
      const paths: Record<string, [string, string]> = admin
        ? {
            orders: ['/admin/orders?page=1&pageSize=50', 'orders'],
            products: ['/admin/products/pending?page=1&pageSize=50', 'products'],
            categories: ['/admin/categories', 'categories'],
            vendors: ['/admin/vendor-applications?page=1&pageSize=50', 'applications'],
            customers: ['/admin/customers?page=1&pageSize=50', 'customers'],
            returns: ['/admin/returns?page=1&pageSize=50', 'requests'],
            reviews: ['/admin/reviews?page=1&pageSize=50&status=PENDING', 'reviews'],
            coupons: ['/admin/coupons?page=1&pageSize=50', 'coupons'],
            settlements: ['/admin/settlements?page=1&pageSize=50', 'settlements'],
            reconciliation: ['/admin/payments/reconciliation', 'report'],
          }
        : {
            orders: ['/vendor/orders', 'orders'],
            returns: ['/vendor/returns?page=1&pageSize=50', 'items'],
            products: ['/vendor/products?page=1&pageSize=100', 'products'],
            inventory: ['/vendor/products?page=1&pageSize=100', 'products'],
            settlements: ['/vendor/settlements?page=1&pageSize=50', 'settlements'],
            profile: ['/vendor', 'vendor'],
          };
      const match = paths[endpoint];
      if (!match) return null;
      return unwrap((await api.get(match[0])).data, match[1]);
    },
  });
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      setStorefrontAccessToken('');
      queryClient.clear();
      navigate(admin ? '/admin/login' : '/vendor/login', { replace: true });
    },
  });
  const displayName = admin
    ? auth.data?.name || 'Administrator'
    : data.data?.name || auth.data?.name || 'Store owner';

  return (
    <div className="workspace-app">
      <aside className={`workspace-sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <Link className="workspace-brand" to={dashboardPath} onClick={() => setMobileOpen(false)}>
          <span className="brand-mark">M</span>
          <span>
            <b>Maison Beauté</b>
            <small>{admin ? 'ADMIN CONSOLE' : 'VENDOR STUDIO'}</small>
          </span>
        </Link>
        <button
          className="workspace-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X size={19} />
        </button>
        <div className="workspace-nav-label">MAIN MENU</div>
        <nav>
          {items.map((item) => (
            <div key={item.path}>
              {item.group && (
                <div className="workspace-nav-label workspace-nav-group">
                  {item.group.toUpperCase()}
                </div>
              )}
              <Link
                className={`workspace-nav-item ${page === item.path ? 'active' : ''}`}
                to={item.path}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            </div>
          ))}
        </nav>
        <div className="workspace-sidebar-bottom">
          <div className="workspace-support">
            <CircleHelp size={18} />
            <div>
              <b>Need a hand?</b>
              <small>Open the commerce workspace</small>
            </div>
          </div>
          <button
            className="workspace-signout"
            disabled={logout.isPending}
            aria-busy={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? <span className="workspace-spinner" /> : <LogOut size={18} />}{' '}
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="workspace-scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            className="workspace-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
          <label className="workspace-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this workspace"
              aria-label="Search this workspace"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="workspace-user">
            <span className="workspace-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{displayName}</b>
              <small>{admin ? 'Administrator' : 'Store manager'}</small>
            </span>
            <ChevronDown size={16} />
          </div>
        </header>
        <main className="workspace-content">
          <div className="workspace-page-heading">
            <div>
              <div className="workspace-eyebrow">
                {admin ? 'MAISON BEAUTÉ · ADMINISTRATION' : 'MAISON BEAUTÉ · VENDOR PORTAL'}
              </div>
              <h1>{heading(endpoint, admin)}</h1>
              <p>{subheading(endpoint, admin)}</p>
            </div>
            <div className="workspace-heading-actions">
              {endpoint === 'overview' && (
                <label className="workspace-month">
                  <span>Period</span>
                  <input
                    type="month"
                    value={periodDate}
                    onChange={(event) => setPeriodDate(event.target.value)}
                  />
                </label>
              )}
            </div>
          </div>
          {endpoint === 'overview' ? (
            <Overview
              role={role}
              summary={summary.data}
              loading={summary.isLoading}
              go={navigate}
            />
          ) : (
            <DataPage
              role={role}
              endpoint={endpoint}
              data={data.data}
              loading={data.isFetching}
              error={data.isError}
              search={search}
              onSearchChange={setSearch}
              refresh={() => queryClient.invalidateQueries({ queryKey: [role, endpoint] })}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>© {new Date().getFullYear()} Maison Beauté</span>
          <span>Data shown from your commerce account</span>
        </footer>
      </div>
    </div>
  );
}

function heading(endpoint: string, admin: boolean) {
  const titles: Record<string, string> = {
    overview: 'Good morning',
    orders: 'Sales & orders',
    products: admin ? 'Product review' : 'Products',
    categories: 'Categories',
    vendors: 'Vendor applications',
    customers: 'Customers',
    returns: 'Returns',
    reviews: 'Review moderation',
    coupons: 'Coupons',
    settlements: 'Settlements',
    reconciliation: 'Payment reconciliation',
    inventory: 'Inventory',
    profile: 'Store profile',
  };
  return titles[endpoint] ?? 'Dashboard';
}
function subheading(endpoint: string, admin: boolean) {
  if (endpoint === 'overview')
    return admin
      ? 'Here is the latest overview of marketplace activity.'
      : 'A clear view of your store performance and daily operations.';
  const descriptions: Record<string, string> = {
    orders: 'Review orders and the current fulfillment status.',
    products: admin
      ? 'Review products submitted by vendors before they go live.'
      : 'Manage your catalog and product listing status.',
    categories: 'Manage the categories available in the storefront.',
    vendors: 'Review vendor applications and account status.',
    customers: 'Review customer accounts, order counts, and account access.',
    returns: 'Review and manage customer return requests.',
    reviews: 'Moderate customer product reviews.',
    coupons: 'Manage platform and vendor promotional codes.',
    settlements: 'Review marketplace payouts and vendor balances.',
    reconciliation: 'Compare recorded payments with provider settlement data.',
    inventory: 'Review on hand and reserved stock for your catalog.',
    profile: 'Update the public details shown for your store.',
  };
  return descriptions[endpoint] ?? '';
}

function Overview({
  role,
  summary,
  loading,
  go,
}: {
  role: Role;
  summary: Row;
  loading: boolean;
  go: (path: string) => void;
}) {
  const admin = role === 'ADMIN';
  const orderQuery = useQuery({
    queryKey: [role, 'overview-orders'],
    queryFn: async () =>
      unwrap(
        (await api.get(admin ? '/admin/orders?page=1&pageSize=8' : '/vendor/orders')).data,
        'orders',
      ),
  });
  const recent = (orderQuery.data ?? []).slice(0, 8);
  const metrics: Array<[string, unknown, string, (value: unknown) => string]> = admin
    ? [
        ['Gross merchandise', summary?.grossMerchandisePaise, 'Paid orders in period', money],
        ['Paid orders', summary?.paidOrders, 'Payment confirmed', String],
        ['Active vendors', summary?.activeVendors, 'Approved stores', String],
        ['Active products', summary?.activeProducts, 'Live in catalog', String],
      ]
    : [
        ['Orders', summary?.orders, 'Paid vendor orders', String],
        ['Your payable', summary?.vendorPayablePaise, 'Net of marketplace commission', money],
        ['Commission', summary?.commissionPaise, 'Marketplace fees', money],
        [
          'Average order',
          summary?.orders ? Number(summary?.vendorPayablePaise ?? 0) / Number(summary?.orders) : 0,
          'Vendor payable per order',
          money,
        ],
      ];
  const statusCounts = admin
    ? (summary?.orderStatusCounts ?? {})
    : recent.reduce((counts: Row, row: Row) => {
        const status = row.status ?? row.order?.status ?? 'UNKNOWN';
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {});
  return (
    <>
      <section className="workspace-metrics">
        {metrics.map(([label, value, note, formatter], index) => (
          <article className="workspace-metric" key={String(label)}>
            <div className="workspace-metric-top">
              <span>{label}</span>
              <span className={`workspace-metric-icon metric-${index}`}>
                <MetricIcon index={index} />
              </span>
            </div>
            <strong>
              {loading ? (
                <span className="workspace-skeleton-value" aria-label="Loading metric" />
              ) : (
                formatter(value)
              )}
            </strong>
            <small>{note}</small>
          </article>
        ))}
      </section>
      <section className="workspace-panels">
        <article className="workspace-panel workspace-status-panel">
          <PanelTitle
            title="Order status"
            note={
              admin
                ? 'Orders created during the selected period'
                : 'Order status across your recent orders'
            }
          />
          <div className="status-stack">
            {loading || orderQuery.isLoading ? (
              <div className="workspace-status-skeleton">
                <i />
                <i />
                <i />
              </div>
            ) : Object.keys(statusCounts).length ? (
              Object.entries(statusCounts)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([status, count]) => (
                  <div className="status-line" key={status}>
                    <span className={`status-dot status-${status.toLowerCase()}`} />
                    <span>{pretty(status)}</span>
                    <b>{String(count)}</b>
                  </div>
                ))
            ) : (
              <Empty text="No orders recorded for this period" />
            )}
          </div>
          <button
            className="workspace-text-link"
            onClick={() => go(`/${role.toLowerCase()}/orders`)}
          >
            View orders <ArrowUpRight size={15} />
          </button>
        </article>
        <article className="workspace-panel workspace-highlight">
          <div className="highlight-icon">
            <ChartNoAxesCombined />
          </div>
          <div className="workspace-eyebrow">
            {admin ? 'MARKETPLACE ACTIVITY' : 'STORE PERFORMANCE'}
          </div>
          <h2>{admin ? 'Business at a glance' : 'Your store at a glance'}</h2>
          {loading ? (
            <div className="workspace-highlight-skeleton">
              <i />
              <i />
            </div>
          ) : (
            <p>
              {admin
                ? `Average paid order value this period: ${money(summary?.averageOrderValuePaise)}. Refunds processed: ${money(summary?.refundsPaise)}.`
                : `The marketplace commission recorded for this period is ${money(summary?.commissionPaise)}.`}
            </p>
          )}
          <button
            className="workspace-outline-button"
            onClick={() => go(admin ? '/admin/orders' : '/vendor/orders')}
          >
            Explore orders <ArrowUpRight size={16} />
          </button>
        </article>
      </section>
      <section className="workspace-panel workspace-table-panel">
        <PanelTitle
          title="Recent orders"
          note="Latest activity from your commerce account"
          action={
            <button
              className="workspace-text-link"
              onClick={() => go(`/${role.toLowerCase()}/orders`)}
            >
              View all <ArrowUpRight size={15} />
            </button>
          }
        />
        <OrdersTable orders={recent} admin={admin} loading={orderQuery.isLoading} />
      </section>
    </>
  );
}
function MetricIcon({ index }: { index: number }) {
  const Icons = [Banknote, ShoppingCart, Users, PackageCheck];
  const Icon = Icons[index % Icons.length]!;
  return <Icon size={18} />;
}
function PanelTitle({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="workspace-panel-title">
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
      {action}
    </div>
  );
}

function WorkspaceTableSkeleton() {
  return (
    <DataCard>
      <div className="workspace-skeleton workspace-skeleton-heading" />
      <div className="workspace-skeleton-table">
        <div className="workspace-skeleton-table-head">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, row) => (
          <div className="workspace-skeleton-table-row" key={row}>
            {Array.from({ length: 6 }, (_, col) => (
              <i key={col} />
            ))}
          </div>
        ))}
      </div>
    </DataCard>
  );
}

function DataPage({
  role,
  endpoint,
  data,
  loading,
  error,
  search,
  onSearchChange,
  refresh,
}: {
  role: Role;
  endpoint: string;
  data: JsonField;
  loading: boolean;
  error: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  refresh: () => void;
}) {
  const admin = role === 'ADMIN';
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createdProductId, setCreatedProductId] = useState('');
  const mutate = useMutation({
    mutationFn: async ({
      method,
      path,
      body,
    }: {
      method: 'post' | 'patch' | 'delete';
      path: string;
      body?: MutationBody;
    }) => api.request({ method, url: path, data: body }),
    onSuccess: (_data, variables) => {
      if (endpoint === 'vendors') {
        setMessage('');
        showToast(
          variables.path.endsWith('/approve')
            ? 'Vendor application approved.'
            : 'Vendor application rejected.',
          'success',
        );
      } else if (endpoint === 'orders') {
        showToast('Order fulfillment updated.', 'success');
      } else if (endpoint === 'customers') {
        showToast(
          variables.path.endsWith('/disable')
            ? 'Customer account disabled.'
            : 'Customer account enabled.',
          'success',
        );
      } else if (variables.path === '/vendor/products' || variables.path === '/admin/categories') {
        if (variables.path === '/vendor/products') {
          const productId = _data?.data?.product?.id;
          if (productId) setCreatedProductId(productId);
        }
        if (variables.path === '/admin/categories') setCreatingCategory(false);
        showToast(
          variables.path === '/vendor/products'
            ? 'Product created as a draft.'
            : 'Category created.',
          'success',
        );
      } else setMessage('Changes saved.');
      refresh();
      queryClient.invalidateQueries({ queryKey: [role, 'analytics'] });
    },
  });
  const rows = useMemo(() => {
    const keyMap: Record<string, string> = {
      orders: 'orders',
      products: 'products',
      categories: 'categories',
      vendors: 'applications',
      customers: 'customers',
      returns: 'requests',
      reviews: 'reviews',
      coupons: 'coupons',
      settlements: 'settlements',
    };
    const raw =
      endpoint === 'profile'
        ? data
          ? [data]
          : []
        : endpoint === 'reconciliation'
          ? (data?.items ?? data?.payments ?? [])
          : Array.isArray(data)
            ? data
            : (data?.[keyMap[endpoint]] ?? []);
    const q = search.trim().toLowerCase();
    return q ? raw.filter((row: Row) => JSON.stringify(row).toLowerCase().includes(q)) : raw;
  }, [data, endpoint, search]);
  const run = (method: 'post' | 'patch' | 'delete', path: string, body?: MutationBody) =>
    mutate.mutate({ method, path, ...(body ? { body } : {}) });
  if (error)
    return (
      <div className="workspace-retry">
        <button className="workspace-outline-button" onClick={refresh}>
          Retry loading this section
        </button>
      </div>
    );
  if (loading) return <WorkspaceTableSkeleton />;
  if (endpoint === 'profile')
    return (
      <ProfileEditor
        profile={data}
        onSave={(body) => run('patch', '/vendor', body)}
        busy={mutate.isPending}
        message={message}
      />
    );
  if (endpoint === 'reconciliation')
    return (
      <DataCard>
        <PanelTitle
          title="Payment reconciliation"
          note="Provider and ledger reconciliation report"
        />
        <pre className="reconciliation-json">{JSON.stringify(data ?? {}, null, 2)}</pre>
      </DataCard>
    );

  const columns: Record<string, string[]> = {
    orders: ['Order', 'Items', 'Status', 'Total', 'Created'],
    products: ['Product', 'Category', 'Status', 'Stock', 'Price'],
    categories: ['Category', 'Slug', 'Status', 'Products'],
    vendors: ['Business', 'Contact', 'Status', 'Submitted'],
    customers: ['Customer', 'Email', 'Orders', 'Joined'],
    returns: ['Return', 'Order', 'Status', 'Reason', 'Requested'],
    reviews: ['Product', 'Rating', 'Review', 'Status', 'Submitted'],
    coupons: ['Code', 'Scope', 'Discount', 'Status', 'Validity'],
    settlements: ['Vendor', 'Amount', 'Status', 'Created'],
    inventory: ['Product', 'SKU', 'On hand', 'Reserved', 'Available'],
  };
  return (
    <>
      {endpoint === 'categories' && admin && creatingCategory && (
        <CategoryCreator
          busy={mutate.isPending}
          onCancel={() => setCreatingCategory(false)}
          onCreate={(body) => run('post', '/admin/categories', body)}
        />
      )}
      {endpoint === 'products' && !admin && creatingProduct && (
        <ProductCreator
          busy={mutate.isPending}
          productId={createdProductId}
          onCancel={() => setCreatingProduct(false)}
          onCreate={(body) => run('post', '/vendor/products', body)}
          onUploaded={() => {
            refresh();
            queryClient.invalidateQueries({ queryKey: [role, 'analytics'] });
          }}
        />
      )}
      <DataCard>
        {message && (
          <div className="workspace-flash" role="status">
            {message}
          </div>
        )}
        <div className="workspace-list-heading">
          <div>
            <h2>{heading(endpoint, admin)}</h2>
            <p>
              {rows.length} {rows.length === 1 ? 'record' : 'records'}
            </p>
          </div>
          <div className="workspace-heading-actions">
            {endpoint === 'categories' && admin && (
              <button
                className="workspace-primary"
                onClick={() => setCreatingCategory((open) => !open)}
              >
                {creatingCategory ? 'Close form' : 'New category'}
              </button>
            )}
            {endpoint === 'products' && !admin && (
              <>
                <label className="workspace-product-search">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search your products"
                    aria-label="Search your products"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <button
                  className="workspace-primary"
                  onClick={() => {
                    setCreatingProduct(true);
                    setCreatedProductId('');
                  }}
                >
                  New product
                </button>
              </>
            )}
            {endpoint === 'settlements' && admin && (
              <button
                className="workspace-primary"
                disabled={mutate.isPending}
                onClick={() => run('post', '/admin/settlements/batch')}
              >
                Create settlement batch
              </button>
            )}
            <button className="workspace-refresh" onClick={refresh}>
              <Activity size={16} /> Refresh
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty text="No records to show yet" />
        ) : (
          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  {(columns[endpoint] ?? Object.keys(rows[0] ?? {}).slice(0, 5)).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: Row, index: number) => (
                  <tr key={row.id ?? row.orderNumber ?? index}>
                    {renderCells(endpoint, row)}
                    <td>
                      <RowActions
                        role={role}
                        endpoint={endpoint}
                        row={row}
                        act={run}
                        pending={mutate.isPending}
                        pendingPath={mutate.variables?.path}
                        pendingBody={mutate.variables?.body}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataCard>
    </>
  );
}

function renderCells(endpoint: string, row: Row) {
  switch (endpoint) {
    case 'orders':
      return (
        <>
          <td>
            <b>{row.orderNumber ?? row.order?.orderNumber ?? 'Order'}</b>
            <small className="table-sub">{row.id?.slice(0, 8)}</small>
          </td>
          <td>
            {(row.items ?? [])
              .map((item: Row) => item.productNameSnapshot ?? item.productName)
              .filter(Boolean)
              .join(', ') || '—'}
          </td>
          <td>
            <StatusPill value={row.status ?? row.order?.status} />
          </td>
          <td>{money(row.payablePaise ?? row.vendorPayablePaise)}</td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    case 'products':
    case 'inventory':
      return (
        <>
          <td>
            {row.images?.[0]?.url && (
              <img className="workspace-product-thumb" src={row.images[0].url} alt="" />
            )}
            <b>{row.name}</b>
            <small className="table-sub">{row.sku}</small>
          </td>
          <td>{row.category?.name ?? '—'}</td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>
            {row.inventory?.onHand ?? 0}{' '}
            <small className="table-sub">{row.inventory?.reserved ?? 0} reserved</small>
          </td>
          <td>{money(row.pricePaise)}</td>
        </>
      );
    case 'categories':
      return (
        <>
          <td>
            <b>{row.name}</b>
          </td>
          <td>{row.slug}</td>
          <td>
            <StatusPill value={row.active ? 'ACTIVE' : 'INACTIVE'} />
          </td>
          <td>{row._count?.products ?? '—'}</td>
        </>
      );
    case 'vendors':
      return (
        <>
          <td>
            <b>{row.businessName ?? row.business?.name ?? 'Vendor application'}</b>
            <small className="table-sub">{row.legalName ?? ''}</small>
          </td>
          <td>
            {row.contactEmail}
            <small className="table-sub">{row.contactPhone}</small>
          </td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    case 'customers':
      return (
        <>
          <td>
            <b>{row.name}</b>
            <small className="table-sub">{row.id?.slice(0, 8)}</small>
          </td>
          <td>{row.email}</td>
          <td>{row._count?.orders ?? 0}</td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    case 'returns':
      return (
        <>
          <td>
            <b>{row.id?.slice(0, 10)}</b>
          </td>
          <td>{row.order?.orderNumber ?? '—'}</td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>{row.reason}</td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    case 'reviews':
      return (
        <>
          <td>
            <b>{row.product?.name ?? row.productName ?? 'Product'}</b>
          </td>
          <td>
            {'★'.repeat(row.rating ?? 0)} ({row.rating ?? 0})
          </td>
          <td>{row.title ?? row.body ?? '—'}</td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    case 'coupons':
      return (
        <>
          <td>
            <b>{row.code}</b>
          </td>
          <td>{pretty(row.scope)}</td>
          <td>{row.discountType === 'PERCENTAGE' ? `${row.value}%` : money(row.value)}</td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>
            {formatDate(row.startsAt)} – {formatDate(row.endsAt)}
          </td>
        </>
      );
    case 'settlements':
      return (
        <>
          <td>
            <b>{row.vendor?.name ?? row.vendorName ?? 'Vendor settlement'}</b>
          </td>
          <td>{money(row.amountPaise ?? row.vendorPayablePaise)}</td>
          <td>
            <StatusPill value={row.status} />
          </td>
          <td>{formatDate(row.createdAt)}</td>
        </>
      );
    default:
      return <td colSpan={5}>{JSON.stringify(row)}</td>;
  }
}

function RowActions({
  role,
  endpoint,
  row,
  act,
  pending = false,
  pendingPath,
  pendingBody,
}: {
  role: Role;
  endpoint: string;
  row: Row;
  act: (method: 'post' | 'patch' | 'delete', path: string, body?: MutationBody) => void;
  pending?: boolean;
  pendingPath?: string;
  pendingBody?: MutationBody;
}) {
  const admin = role === 'ADMIN';
  if (!admin && endpoint === 'orders') {
    const status = String(row.status ?? '');
    const transition = nextVendorOrderAction(status);
    if (!transition) return <span className="table-muted">No action available</span>;
    const path = `/vendor/orders/${row.id}/status`;
    if (status === 'PACKED') {
      return <TrackingEditor path={path} pending={pending} act={act} />;
    }
    return (
      <div className="row-actions">
        <ActionButton
          label={transition.label}
          loadingLabel="Updating…"
          method="patch"
          path={path}
          body={{ status: transition.status }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
      </div>
    );
  }
  if (endpoint === 'products' && admin) {
    if (row.status !== 'PENDING_REVIEW')
      return <span className="table-muted">Decision recorded</span>;
    const approvePath = `/admin/products/${row.id}/approve`;
    const rejectPath = `/admin/products/${row.id}/reject`;
    return (
      <div className="row-actions">
        <ActionButton
          label="Approve"
          loadingLabel="Approving…"
          method="post"
          path={approvePath}
          body={{ reason: 'Approved after admin review.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
        <ActionButton
          className="danger"
          label="Reject"
          loadingLabel="Rejecting…"
          method="post"
          path={rejectPath}
          body={{ reason: 'Please revise this listing before resubmission.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
      </div>
    );
  }
  if (endpoint === 'vendors') {
    if (row.status !== 'PENDING') return <span className="table-muted">Decision recorded</span>;
    return (
      <div className="row-actions">
        <ActionButton
          label="Approve"
          loadingLabel="Approving…"
          method="post"
          path={`/admin/vendor-applications/${row.id}/approve`}
          body={{ reason: 'Approved after admin review.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
        <ActionButton
          className="danger"
          label="Reject"
          loadingLabel="Rejecting…"
          method="post"
          path={`/admin/vendor-applications/${row.id}/reject`}
          body={{ reason: 'Application needs more information.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
      </div>
    );
  }
  if (endpoint === 'customers') {
    const disabled = Boolean(row.disabledAt);
    return (
      <div className="row-actions">
        <ActionButton
          label={disabled ? 'Enable' : 'Disable'}
          loadingLabel={disabled ? 'Enabling…' : 'Disabling…'}
          method="post"
          path={`/admin/customers/${row.id}/${disabled ? 'enable' : 'disable'}`}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
        />
        <StatusPill value={disabled ? 'DISABLED' : 'ACTIVE'} />
      </div>
    );
  }
  if (endpoint === 'reviews')
    return (
      <div className="row-actions">
        <ActionButton
          label="Publish"
          loadingLabel="Publishing…"
          method="patch"
          path={`/admin/reviews/${row.id}/moderation`}
          body={{ status: 'PUBLISHED', reason: 'Approved after review.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
        <ActionButton
          className="danger"
          label="Hide"
          loadingLabel="Hiding…"
          method="patch"
          path={`/admin/reviews/${row.id}/moderation`}
          body={{ status: 'HIDDEN', reason: 'Hidden after moderation.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
          pendingBody={pendingBody}
        />
      </div>
    );
  if (endpoint === 'categories')
    return (
      <div className="row-actions">
        <ActionButton
          label={row.active ? 'Deactivate' : 'Activate'}
          method="patch"
          path={`/admin/categories/${row.id}`}
          body={{ active: !row.active }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
        />
      </div>
    );
  if (endpoint === 'coupons')
    return (
      <div className="row-actions">
        <ActionButton
          label={row.status === 'ACTIVE' ? 'Disable' : 'Activate'}
          method="patch"
          path={`/admin/coupons/${row.id}`}
          body={{ status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
        />
      </div>
    );
  if (endpoint === 'returns' && admin)
    return (
      <div className="row-actions">
        <ActionButton
          label="Review"
          method="patch"
          path={`/admin/returns/${row.id}`}
          body={{ status: 'UNDER_REVIEW', reason: 'Return is under review.' }}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
        />
        {row.status === 'RECEIVED' && (
          <ActionButton
            label="Refund"
            method="post"
            path={`/admin/returns/${row.id}/refund`}
            act={act}
            pending={pending}
            pendingPath={pendingPath}
          />
        )}
      </div>
    );
  if (endpoint === 'settlements' && admin && row.status === 'PENDING')
    return (
      <div className="row-actions">
        <ActionButton
          label="Transfer"
          method="post"
          path={`/admin/settlements/${row.id}/transfer`}
          act={act}
          pending={pending}
          pendingPath={pendingPath}
        />
      </div>
    );
  if (!admin && endpoint === 'products')
    return (
      <div className="row-actions">
        {['DRAFT', 'REJECTED', 'ACTIVE'].includes(row.status) && <VendorProductEditor row={row} />}
        {['DRAFT', 'REJECTED'].includes(row.status) && (
          <ActionButton
            label="Submit"
            method="post"
            path={`/vendor/products/${row.id}/submit`}
            act={act}
            pending={pending}
            pendingPath={pendingPath}
          />
        )}
        {row.status !== 'ARCHIVED' && (
          <ActionButton
            className="danger"
            label="Archive"
            method="post"
            path={`/vendor/products/${row.id}/archive`}
            act={act}
            pending={pending}
            pendingPath={pendingPath}
          />
        )}
      </div>
    );
  if (!admin && endpoint === 'inventory') return <StockEditor row={row} act={act} />;
  return <span className="table-muted">—</span>;
}

function VendorProductEditor({ row }: { row: Row }) {
  const queryClient = useQueryClient();
  const variant = row.variants?.find((item: Row) => item.isDefault) ?? row.variants?.[0] ?? {};
  const [name, setName] = useState(String(row.name ?? ''));
  const [slug, setSlug] = useState(String(row.slug ?? ''));
  const [sku, setSku] = useState(String(variant.sku ?? row.sku ?? ''));
  const [price, setPrice] = useState(
    String(Number(variant.pricePaise ?? row.pricePaise ?? 0) / 100),
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    row.compareAtPricePaise ? String(Number(row.compareAtPricePaise) / 100) : '',
  );
  const [description, setDescription] = useState(String(row.description ?? ''));
  const [taxCode, setTaxCode] = useState(String(row.taxCode ?? ''));
  const [saving, setSaving] = useState(false);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/vendor/products/${row.id}`, {
        name: name.trim(),
        slug: slug.trim(),
        sku: sku.trim(),
        description,
        pricePaise: String(Math.round(Number(price) * 100)),
        compareAtPricePaise: compareAtPrice
          ? String(Math.round(Number(compareAtPrice) * 100))
          : null,
        taxCode: taxCode.trim(),
      });
      showToast('Your product changes have been saved.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['VENDOR', 'products'] });
    } catch {
      showToast('Could not save product changes. Check the fields and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };
  if (!['DRAFT', 'REJECTED', 'ACTIVE'].includes(row.status))
    return <span className="table-muted">Locked for review</span>;
  return (
    <details className="vendor-product-edit">
      <summary>Edit</summary>
      <form className="vendor-product-edit-form" onSubmit={(event) => void save(event)}>
        <label>
          Product name
          <input
            required
            maxLength={240}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Slug
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={260}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
        <label>
          SKU
          <input required value={sku} onChange={(event) => setSku(event.target.value)} />
        </label>
        <label>
          Price (₹)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
        <label>
          Compare-at price (₹)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={compareAtPrice}
            onChange={(event) => setCompareAtPrice(event.target.value)}
          />
        </label>
        <label>
          Tax code
          <input
            required
            maxLength={40}
            value={taxCode}
            onChange={(event) => setTaxCode(event.target.value)}
          />
        </label>
        <label className="edit-description">
          Description
          <textarea
            rows={3}
            maxLength={20000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </details>
  );
}

function ProductCreator({
  busy,
  productId,
  onCancel,
  onCreate,
  onUploaded,
}: {
  busy: boolean;
  productId: string;
  onCancel: () => void;
  onCreate: (body: MutationBody) => void;
  onUploaded: () => void;
}) {
  const categories = useQuery({
    queryKey: ['vendor', 'product-categories'],
    queryFn: async () => {
      const response = await api.get('/categories');
      const value = response.data?.data;
      return Array.isArray(value) ? value : (value?.categories ?? []);
    },
  });
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [initialStock, setInitialStock] = useState('0');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const toPaise = (value: string) => String(Math.round(Number(value) * 100));
  const uploadImages = async () => {
    if (!productId || !imageFiles.length || uploadingImages) return;
    setUploadingImages(true);
    try {
      for (const [index, file] of imageFiles.entries()) {
        const mimeType = file.type;
        const signed = await api.post(`/vendor/products/${productId}/images/upload-url`, {
          mimeType,
          sizeBytes: file.size,
        });
        const { uploadUrl, key } = signed.data?.data ?? {};
        if (!uploadUrl || !key) throw new Error('Could not prepare the image upload.');
        const uploaded = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: file,
        });
        if (!uploaded.ok) throw new Error(`Upload failed for ${file.name}.`);
        await api.post(`/vendor/products/${productId}/images`, {
          objectKey: key,
          mimeType,
          sizeBytes: file.size,
          altText: name.trim() || file.name,
          sortOrder: index,
        });
      }
      showToast(
        `${imageFiles.length} product image${imageFiles.length === 1 ? '' : 's'} uploaded.`,
        'success',
      );
      setImageFiles([]);
      onUploaded();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload product images.';
      showToast(message, 'error');
    } finally {
      setUploadingImages(false);
    }
  };
  return (
    <div
      className="workspace-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !uploadingImages) onCancel();
      }}
    >
      <section
        className="workspace-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-image-title"
      >
        {productId ? (
          <section
            className="profile-form product-image-step"
            aria-labelledby="product-image-title"
          >
            <h2 id="product-image-title">Add product images</h2>
            <p>Your draft is saved. Add clear product photos before submitting it for review.</p>
            <label className="product-image-picker">
              <span>Choose images</span>
              <small>JPEG, PNG or WebP · up to 10 MB each · multiple images supported</small>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploadingImages}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const valid = files.filter(
                    (file) =>
                      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
                      file.size > 0 &&
                      file.size <= 10 * 1024 * 1024,
                  );
                  if (valid.length !== files.length)
                    showToast(
                      'Choose JPEG, PNG or WebP images no larger than 10 MB each.',
                      'error',
                    );
                  setImageFiles(valid);
                  event.target.value = '';
                }}
              />
            </label>
            {imageFiles.length > 0 && (
              <ul className="product-image-file-list">
                {imageFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`}>{file.name}</li>
                ))}
              </ul>
            )}
            <div className="row-actions">
              <button
                type="button"
                disabled={!imageFiles.length || uploadingImages}
                aria-busy={uploadingImages}
                onClick={() => void uploadImages()}
              >
                {uploadingImages ? 'Uploading images…' : `Upload ${imageFiles.length || ''} images`}
              </button>
              <button type="button" disabled={uploadingImages} onClick={onCancel}>
                {imageFiles.length ? 'Finish later' : 'Done'}
              </button>
            </div>
          </section>
        ) : (
          <form
            className="profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate({
                categoryId,
                name: name.trim(),
                slug: slug.trim(),
                sku: sku.trim(),
                description: description.trim(),
                pricePaise: toPaise(price),
                ...(compareAtPrice ? { compareAtPricePaise: toPaise(compareAtPrice) } : {}),
                taxCode: taxCode.trim(),
                initialStock: Number(initialStock),
              });
            }}
          >
            <h2 id="product-image-title">New product</h2>
            <p>Products are saved as drafts. Submit them for admin review when they are ready.</p>
            <div className="workspace-form-grid">
              <label>
                Product name
                <input
                  required
                  maxLength={240}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSlug(
                      event.target.value
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, ''),
                    );
                  }}
                />
              </label>
              <label>
                Slug
                <input
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  maxLength={260}
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                />
              </label>
              <label>
                SKU
                <input
                  required
                  maxLength={100}
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  required
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  disabled={categories.isLoading}
                >
                  <option value="">
                    {categories.isLoading ? 'Loading categories…' : 'Select category'}
                  </option>
                  {(categories.data ?? []).map((category: Row) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price (₹)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
              <label>
                Compare-at price (₹)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={compareAtPrice}
                  onChange={(event) => setCompareAtPrice(event.target.value)}
                />
              </label>
              <label>
                Tax code
                <input
                  required
                  maxLength={40}
                  value={taxCode}
                  onChange={(event) => setTaxCode(event.target.value)}
                />
              </label>
              <label>
                Initial stock
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={initialStock}
                  onChange={(event) => setInitialStock(event.target.value)}
                />
              </label>
            </div>
            <label className="product-image-picker">
              <span>Product images (optional)</span>
              <small>JPEG, PNG or WebP · up to 10 MB each · choose multiple images</small>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  const valid = files.filter(
                    (file) =>
                      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
                      file.size > 0 &&
                      file.size <= 10 * 1024 * 1024,
                  );
                  if (valid.length !== files.length)
                    showToast(
                      'Choose JPEG, PNG or WebP images no larger than 10 MB each.',
                      'error',
                    );
                  setImageFiles(valid);
                  event.target.value = '';
                }}
              />
            </label>
            {imageFiles.length > 0 && (
              <ul className="product-image-file-list">
                {imageFiles.map((file) => (
                  <li key={`${file.name}-${file.size}`}>{file.name}</li>
                ))}
              </ul>
            )}
            <label>
              Description
              <textarea
                rows={4}
                maxLength={20000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <p className="table-muted">
              Choose a tax code already configured by the marketplace administrator.
            </p>
            <div className="row-actions">
              <button
                type="submit"
                disabled={busy || categories.isLoading || !categories.data?.length}
                aria-busy={busy}
              >
                {busy ? 'Creating…' : 'Create draft'}
              </button>
              <button type="button" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function CategoryCreator({
  busy,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  onCancel: () => void;
  onCreate: (body: MutationBody) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  return (
    <DataCard>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            name: name.trim(),
            slug: slug.trim(),
            description: description.trim() || null,
          });
        }}
      >
        <h2>Create category</h2>
        <p>New active categories become available to customers and vendor listings.</p>
        <label>
          Name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSlug(
                event.target.value
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, ''),
              );
            }}
          />
        </label>
        <label>
          Slug
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={160}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="row-actions">
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Creating…' : 'Create category'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </DataCard>
  );
}

function TrackingEditor({
  path,
  pending,
  act,
}: {
  path: string;
  pending: boolean;
  act: (method: 'post' | 'patch' | 'delete', path: string, body?: MutationBody) => void;
}) {
  const [trackingReference, setTrackingReference] = useState('');
  const [carrier, setCarrier] = useState('');
  return (
    <form
      className="stock-editor fulfillment-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const reference = trackingReference.trim();
        if (!reference) return;
        act('patch', path, {
          status: 'SHIPPED',
          trackingReference: reference,
          ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        });
      }}
    >
      <input
        aria-label="Tracking reference"
        required
        maxLength={200}
        value={trackingReference}
        onChange={(event) => setTrackingReference(event.target.value)}
        placeholder="Tracking number"
      />
      <input
        aria-label="Carrier"
        maxLength={120}
        value={carrier}
        onChange={(event) => setCarrier(event.target.value)}
        placeholder="Carrier"
      />
      <button type="submit" disabled={pending || !trackingReference.trim()} aria-busy={pending}>
        {pending ? 'Shipping…' : 'Ship order'}
      </button>
    </form>
  );
}

function ActionButton({
  label,
  loadingLabel = 'Saving…',
  method,
  path,
  body,
  act,
  pending,
  pendingPath,
  pendingBody,
  className = '',
}: {
  label: string;
  loadingLabel?: string;
  method: 'post' | 'patch' | 'delete';
  path: string;
  body?: MutationBody;
  act: (method: 'post' | 'patch' | 'delete', path: string, body?: MutationBody) => void;
  pending: boolean;
  pendingPath?: string;
  pendingBody?: MutationBody;
  className?: string;
}) {
  const busy =
    pending &&
    pendingPath === path &&
    (pendingBody === undefined || JSON.stringify(body ?? {}) === JSON.stringify(pendingBody ?? {}));
  return (
    <button
      className={className}
      disabled={pending}
      aria-busy={busy}
      onClick={() => act(method, path, body)}
    >
      {busy && <span className="workspace-spinner" />}
      {busy ? loadingLabel : label}
    </button>
  );
}

function StockEditor({
  row,
  act,
}: {
  row: Row;
  act: (method: 'post', path: string, body: MutationBody) => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('Stock count update');
  return (
    <form
      className="stock-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const qty = Number(delta);
        if (qty) {
          act('post', `/vendor/products/${row.id}/inventory-adjustments`, { delta: qty, reason });
          setDelta('');
        }
      }}
    >
      <input
        aria-label="Stock change"
        type="number"
        value={delta}
        onChange={(event) => setDelta(event.target.value)}
        placeholder="± units"
      />
      <input
        aria-label="Reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason"
      />
      <button type="submit">Update</button>
    </form>
  );
}

function ProfileEditor({
  profile,
  onSave,
  busy,
  message,
}: {
  profile: Row;
  onSave: (body: MutationBody) => void;
  busy: boolean;
  message: string;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  return (
    <DataCard>
      <div className="profile-form">
        <h2>Store details</h2>
        <p>These details appear alongside your products in the customer storefront.</p>
        <label>
          Store name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
        </label>
        <label>
          Store description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={5000}
          />
        </label>
        {message && <p className="workspace-flash">{message}</p>}
        <button
          className="workspace-primary"
          disabled={busy}
          onClick={() => onSave({ name, description })}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </DataCard>
  );
}
function DataCard({ children }: { children: React.ReactNode }) {
  return <section className="workspace-panel workspace-data-card">{children}</section>;
}
function Empty({ text }: { text: string }) {
  return (
    <div className="workspace-empty">
      <div className="empty-icon">
        <ClipboardList size={22} />
      </div>
      <b>{text}</b>
      <span>New activity will appear here when it is available.</span>
    </div>
  );
}
function StatusPill({ value }: { value: unknown }) {
  const status = String(value ?? 'UNKNOWN');
  return <span className={`workspace-pill pill-${status.toLowerCase()}`}>{pretty(status)}</span>;
}
function OrdersTable({
  orders,
  admin,
  loading,
}: {
  orders: Row[];
  admin: boolean;
  loading: boolean;
}) {
  return (
    <div className="workspace-table-wrap">
      <table className="workspace-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Items</th>
            <th>Status</th>
            <th>{admin ? 'Total' : 'Your payable'}</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }, (_, i) => (
              <tr key={i}>
                <td colSpan={5}>
                  <span className="workspace-table-line" />
                </td>
              </tr>
            ))
          ) : orders.length ? (
            orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <b>{order.orderNumber ?? order.order?.orderNumber}</b>
                  <small className="table-sub">{order.id?.slice(0, 8)}</small>
                </td>
                <td>
                  {(order.items ?? [])
                    .map((item: Row) => item.productNameSnapshot ?? item.productName)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td>
                  <StatusPill value={order.status ?? order.order?.status} />
                </td>
                <td>{money(admin ? order.payablePaise : order.vendorPayablePaise)}</td>
                <td>{formatDate(order.createdAt ?? order.order?.createdAt)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>
                <Empty text="No orders recorded yet" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function formatDate(value?: string) {
  return value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}
