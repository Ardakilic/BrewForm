/**
 * Route aggregator — mounts all API modules at their /api/v1/* prefixes.
 *
 * Each module follows the model→service→controller pattern:
 *   model.ts    — Drizzle data access layer
 *   service.ts  — Business logic and validation
 *   index.ts    — Hono routes with Zod validation (this file's import targets)
 *
 * Health and OpenAPI are mounted at / (no prefix).
 * See docs/api.md for the full endpoint reference.
 */
import { Hono } from 'hono';
import health from './health.ts';
import { registerOpenApi } from './openapi.ts';
import type { AppEnv } from '../types/hono.ts';
import auth from '../modules/auth/index.ts';
import user from '../modules/user/index.ts';
import recipe from '../modules/recipe/index.ts';
import equipment from '../modules/equipment/index.ts';
import bean from '../modules/bean/index.ts';
import coffeeVariety from '../modules/coffee-variety/index.ts';
import vendor from '../modules/vendor/index.ts';
import taste from '../modules/taste/index.ts';
import photo from '../modules/photo/index.ts';
import comment from '../modules/comment/index.ts';
import follow from '../modules/follow/index.ts';
import badge from '../modules/badge/index.ts';
import setup from '../modules/setup/index.ts';
import preference from '../modules/preference/index.ts';
import qrcode from '../modules/qrcode/index.ts';
import report from '../modules/report/index.ts';
import contact from '../modules/contact/index.ts';
import admin from '../modules/admin/index.ts';
import share from './share.ts';
import sitemap from './sitemap.ts';

const routes = new Hono<AppEnv>();

routes.route('/', health);
routes.route('/share', share);
routes.route('/api/v1/sitemap.xml', sitemap);

routes.route('/api/v1/auth', auth);
routes.route('/api/v1/users', user);
routes.route('/api/v1/recipes', recipe);
routes.route('/api/v1/equipment', equipment);
routes.route('/api/v1/beans', bean);
routes.route('/api/v1/coffee-varieties', coffeeVariety);
routes.route('/api/v1/vendors', vendor);
routes.route('/api/v1/taste-notes', taste);
routes.route('/api/v1/photos', photo);
routes.route('/api/v1/comments', comment);
routes.route('/api/v1/follow', follow);
routes.route('/api/v1/badges', badge);
routes.route('/api/v1/setups', setup);
routes.route('/api/v1/preferences', preference);
routes.route('/api/v1/qrcode', qrcode);
routes.route('/api/v1/reports', report);
routes.route('/api/v1/contact', contact);
routes.route('/api/v1/admin', admin);

registerOpenApi(routes);

export default routes;
