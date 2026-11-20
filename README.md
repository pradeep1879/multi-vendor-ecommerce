# Aster Market

A multi-vendor e-commerce platform where customers can shop for products, vendors can manage their stores, and admins can manage the entire marketplace.

Sample accounts:

- Admin: `admin@example.test`
- Password: 486cfa7feb0ae266a50f6aeddc40392b


- Vendor: `vendor-one@example.test`
- Password: f540077ae2bf3bc23cf41006929116e9


- Vendor: `vendor-two@example.test`
- Password: d14876f1f2dd728a881bb21627d08d7c


- Customer: `customer@example.sample`
- Password: Customer@12345




## Features

### Customer
- Browse products, categories, and search.
- Add products to wishlist and cart.
- Manage addresses and checkout.
- Track orders and view order history.
- Submit product ratings and reviews.
- Manage profile, notifications, returns, and refunds.
- Sign up, login, Google login, and password recovery.
- Apply to become a vendor.

### Vendor
- Vendor dashboard and store management.
- Add, edit, and manage products.
- Manage inventory and orders.
- Update shipments and handle returns.
- Access restricted to approved vendors.

### Admin
- Admin dashboard and marketplace overview.
- Manage customers, vendors, and products.
- Manage categories, orders, and returns.
- Handle refunds and coupons.
- Moderate product reviews.

### Additional Features
- Secure authentication and role-based access.
- PostgreSQL database.
- Redis support for cart caching.
- Product image uploads.
- Product search.
- Razorpay test payments.
- Sample data for local development.

## Tech Stack

| Technology | Purpose |
|---|---|
| React + Vite | Frontend |
| TypeScript | Programming language |
| Tailwind CSS | Styling |
| Express.js | Backend |
| Bun | Runtime and package manager |
| PostgreSQL | Database |
| Prisma | Database management |
| Redis | Cart caching |
| Elasticsearch | Product search |
| S3 / MinIO | Image storage |
| Razorpay | Payments |
| Docker | Application setup |

## Project Structure

```text
aster-market/
├── backend/
│   ├── prisma/          # Database and migrations
│   ├── src/
│   │   ├── common/
│   │   ├── config/
│   │   ├── modules/
│   │   └── infrastructure/
│   ├── Dockerfile
│   └── openapi.yaml
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   └── storefront/
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

## Getting Started

### Requirements
- Bun 1.3+
- Docker
- PostgreSQL 16+

### 1. Clone the Repository

```bash
git clone <repository-url>
cd aster-market
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Configure the required environment variables, including your database URL and JWT secret.

### 3. Start the Application

```bash
docker compose up --build -d
```

### 4. Open the Application

| Service | URL |
|---|---|
| Storefront | http://localhost:3001 |
| Backend API | http://localhost:3000 |

### Optional: Add Sample Data

```bash
DEV_SEED_PASSWORD='your-local-password' docker compose --profile seed run --rm seed
```

Sample accounts:

- Admin: `admin@example.test`
- Vendor: `vendor-one@example.test`
- Vendor: `vendor-two@example.test`
- Customer: `customer@example.test`

Use the password provided in `DEV_SEED_PASSWORD` to log in.

### Docker Commands

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

To remove database data as well:

```bash
docker compose down -v
```

**Warning:** This deletes your local database data.

## Run Locally Without Docker

Start PostgreSQL and configure `backend/.env`.

Install dependencies:

```bash
cd backend
bun install
bun run db:deploy

cd ../frontend
bun install
```

Start the backend:

```bash
cd backend
bun run dev
```

Start the frontend in another terminal:

```bash
cd frontend
bun run dev
```

Open http://localhost:5173.

## Environment Variables

Important variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Database connection |
| `JWT_ACCESS_SECRET` | Authentication security |
| `FRONTEND_URL` | Frontend address |
| `REDIS_URL` | Redis connection |
| `GOOGLE_CLIENT_ID` | Google login |
| `VITE_API_URL` | Backend address |
| `PAYMENT_KEY_ID` | Razorpay key ID |
| `PAYMENT_KEY_SECRET` | Razorpay secret |
| `S3_BUCKET` | Image storage |

Keep all private keys and secrets in `backend/.env`. Never expose them in frontend environment variables.

## Useful Commands

Run these commands from the relevant application directory.

| Command | Purpose |
|---|---|
| `bun run dev` | Start development server |
| `bun run build` | Build application |
| `bun run start` | Start production server |
| `bun run typecheck` | Check TypeScript |
| `bun run lint` | Check code |
| `bun test` | Run tests |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:deploy` | Apply database migrations |
| `bun run db:seed` | Add sample data |

## Documentation

- `backend/README.md` – Backend setup.
- `frontend/README.md` – Frontend setup.
- `backend/openapi.yaml` – API documentation.

---

**Built with React, TypeScript, Express, PostgreSQL, and Bun.**