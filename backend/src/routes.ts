import express, { type Router } from 'express';
import type { Environment } from './config/env.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAccountsRouter } from './modules/accounts/accounts.routes.js';
import { createCatalogRouter } from './modules/catalog/catalog.routes.js';
import { createCartRouter } from './modules/cart/cart.routes.js';
import { createOrdersRouter } from './modules/orders/orders.routes.js';
import { createCouponsRouter } from './modules/coupons/coupons.routes.js';
import { createReviewsRouter } from './modules/reviews/reviews.routes.js';
import { createPaymentsRouter } from './modules/payments/payments.routes.js';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes.js';
import { createWishlistRouter } from './modules/wishlist/wishlist.routes.js';
import { createReturnsRouter } from './modules/returns/returns.routes.js';
import { createCustomerSettingsRouter } from './modules/accounts/customer-settings.routes.js';

export function createApiRouter(environment: Environment): Router {
  const router = express.Router();
  router.use(createAuthRouter(environment));
  router.use(createAccountsRouter(environment));
  router.use(createCatalogRouter(environment));
  router.use(createCartRouter(environment));
  router.use(createOrdersRouter(environment));
  router.use(createCouponsRouter(environment));
  router.use(createReviewsRouter(environment));
  router.use(createPaymentsRouter(environment));
  router.use(createAnalyticsRouter(environment));
  router.use(createWishlistRouter(environment));
  router.use(createReturnsRouter(environment));
  router.use(createCustomerSettingsRouter(environment));
  return router;
}
