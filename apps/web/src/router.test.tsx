import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

import { router } from './router.tsx';
import { likeAction } from './routes/like.ts';
import { favouriteAction } from './routes/favourite.ts';
import { rateAction } from './routes/rate.ts';
import { followAction } from './routes/follow.ts';

/** Minimal view of a react-router route object for config assertions. */
interface RouteNode {
  path?: string;
  index?: boolean;
  element?: unknown;
  loader?: unknown;
  action?: unknown;
  lazy?: unknown;
  errorElement?: unknown;
  children?: RouteNode[];
}

/** Recursively flatten the route tree into a map keyed by relative path. */
function flatten(
  routes: RouteNode[],
  acc: Map<string, RouteNode> = new Map(),
): Map<string, RouteNode> {
  for (const route of routes) {
    if (route.index) acc.set('__index__', route);
    if (typeof route.path === 'string') acc.set(route.path, route);
    if (route.children) flatten(route.children, acc);
  }
  return acc;
}

const top = router.routes as RouteNode[];
const root = top.find((r) => r.path === '/');
const byPath = flatten(root?.children ?? []);

describe('router route config', () => {
  it('declares exactly two top-level routes: the app shell and /admin', () => {
    expect(top).toHaveLength(2);
    expect(top.map((r) => r.path).sort()).toEqual(['/', '/admin']);
  });

  it('wraps the app in the Layout shell with an error boundary and children', () => {
    expect(root).toBeDefined();
    expect(root?.element).toBeTruthy();
    expect(root?.errorElement).toBeTruthy();
    expect(Array.isArray(root?.children)).toBe(true);
    expect(root!.children!.length).toBeGreaterThan(20);
  });

  it('gives the /admin route a lazy component, error boundary, and children', () => {
    const admin = top.find((r) => r.path === '/admin');
    expect(admin?.lazy).toBeTypeOf('function');
    expect(admin?.errorElement).toBeTruthy();
    expect(admin!.children!.length).toBeGreaterThan(5);
  });

  it('gives every route a path or marks it as an index route', () => {
    for (const route of byPath.values()) {
      expect(typeof route.path === 'string' || route.index === true).toBe(true);
    }
  });

  it('renders the HomePage on the index route and wires its loader', () => {
    const index = byPath.get('__index__');
    expect(index?.element).toBeTruthy();
    expect(index?.loader).toBeTypeOf('function');
  });

  it('wires loaders on the data-driven pages', () => {
    const withLoaders = [
      'recipes',
      'recipes/starred',
      'recipes/:slug',
      'collections',
      'collections/browse',
      'collections/:id',
      'collections/:id/edit',
      'u/:username',
      'settings',
      'notifications',
    ];
    for (const path of withLoaders) {
      expect(byPath.get(path), `expected route "${path}" to exist`).toBeDefined();
      expect(byPath.get(path)?.loader, `expected "${path}" to have a loader`).toBeTypeOf(
        'function',
      );
    }
  });

  it('renders elements on the static auth and content pages', () => {
    const withElements = [
      'login',
      'register',
      'forgot-password',
      'reset-password',
      'verify-email',
      'recipes/unavailable',
      'taste-notes',
      'contact',
      'privacy',
      'terms',
    ];
    for (const path of withElements) {
      expect(byPath.get(path), `expected route "${path}" to exist`).toBeDefined();
      expect(byPath.get(path)?.element, `expected "${path}" to have an element`).toBeTruthy();
    }
  });

  it('registers the social resource routes with their action functions', () => {
    expect(byPath.get('recipes/:id/like')?.action).toBe(likeAction);
    expect(byPath.get('recipes/:id/favourite')?.action).toBe(favouriteAction);
    expect(byPath.get('recipes/:id/rate')?.action).toBe(rateAction);
    expect(byPath.get('follow/:userId')?.action).toBe(followAction);
  });

  it('registers the comment resource routes with a loader and actions', () => {
    const listRoute = byPath.get('comments/recipe/:recipeId');
    expect(listRoute?.loader).toBeTypeOf('function');
    expect(listRoute?.action).toBeTypeOf('function');
    expect(byPath.get('comments/:id')?.action).toBeTypeOf('function');
  });

  it('falls back to the NotFoundPage for unmatched paths', () => {
    expect(byPath.get('*')?.element).toBeTruthy();
  });
});
