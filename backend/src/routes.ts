import express, { type Router } from 'express';
import type { Environment } from './config/env';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createAccountsRouter } from './modules/accounts/accounts.routes';
import { createCatalogRouter } from './modules/catalog/catalog.routes';
import { createCartRouter } from './modules/cart/cart.routes';
import { createOrdersRouter } from './modules/orders/orders.routes';
import { createCouponsRouter } from './modules/coupons/coupons.routes';
import { createReviewsRouter } from './modules/reviews/reviews.routes';
import { createPaymentsRouter } from './modules/payments/payments.routes';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes';
import { createWishlistRouter } from './modules/wishlist/wishlist.routes';
import { createReturnsRouter } from './modules/returns/returns.routes';
import { createCustomerSettingsRouter } from './modules/accounts/customer-settings.routes';

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
