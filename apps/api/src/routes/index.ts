import { Hono } from 'hono';
import health from './health.ts';
import openapi from './openapi.ts';
import auth from '../modules/auth/index.ts';

const routes = new Hono();

routes.route('/', health);
routes.route('/', openapi);
routes.route('/api/v1/auth', auth);

export default routes;