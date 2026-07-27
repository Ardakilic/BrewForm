/**
 * Coffee bean business logic for BrewForm.
 *
 * Orchestrates bean CRUD with ownership verification — only the bean owner
 * may update or delete a record.
 */
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';
import type { BeanCreate, BeanUpdate } from '@brewform/shared/schemas';

/**
 * Bean service.
 *
 * Provides listing, lookup, creation, update, and soft-deletion of coffee beans.
 */
export const log = createLogger('bean-service');

/** List paginated beans for the authenticated user. */
export async function listBeans(userId: string, page: number, perPage: number) {
  log.debug({ userId, page, perPage }, 'listBeans started');
  const result = await model.findByUser(userId, page, perPage);
  log.debug({ userId, page, perPage, total: result.total }, 'listBeans completed');
  return result;
}

/** Get a bean by ID. Throws BEAN_NOT_FOUND if it doesn't exist. */
export async function getBean(id: string) {
  log.debug({ id }, 'getBean started');
  const bean = await model.findById(id);
  if (!bean) {
    const err = new Error('BEAN_NOT_FOUND');
    log.error({ err, id }, 'getBean failed: bean not found');
    throw err;
  }
  log.debug({ id }, 'getBean completed');
  return bean;
}

/** Create a new bean owned by the authenticated user. */
export async function createBean(userId: string, data: BeanCreate) {
  log.debug({ userId }, 'createBean started');
  const result = await model.create({ ...data, userId });
  log.debug({ userId, beanId: result.id }, 'createBean completed');
  return result;
}

/**
 * Update a bean. Only the owner may update.
 *
 * @throws BEAN_NOT_FOUND if the bean doesn't exist
 * @throws FORBIDDEN if the user doesn't own the bean
 */
export async function updateBean(userId: string, id: string, data: BeanUpdate) {
  log.debug({ userId, id }, 'updateBean started');
  const bean = await model.findById(id);
  if (!bean) {
    const err = new Error('BEAN_NOT_FOUND');
    log.error({ err, id, userId }, 'updateBean failed: bean not found');
    throw err;
  }
  if (bean.userId !== userId) {
    log.warn({ id, userId, ownerId: bean.userId }, 'updateBean failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  const updated = await model.update(id, data);
  if (!updated) {
    const err = new Error('BEAN_NOT_FOUND');
    log.error({ err, id, userId }, 'updateBean failed: bean not found');
    throw err;
  }
  log.debug({ userId, id }, 'updateBean completed');
  return updated;
}

/**
 * Soft-delete a bean. Only the owner may delete.
 *
 * @throws BEAN_NOT_FOUND if the bean doesn't exist
 * @throws FORBIDDEN if the user doesn't own the bean
 */
export async function deleteBean(userId: string, id: string) {
  log.debug({ userId, id }, 'deleteBean started');
  const bean = await model.findById(id);
  if (!bean) {
    const err = new Error('BEAN_NOT_FOUND');
    log.error({ err, id, userId }, 'deleteBean failed: bean not found');
    throw err;
  }
  if (bean.userId !== userId) {
    log.warn({ id, userId, ownerId: bean.userId }, 'deleteBean failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  const deleted = await model.softDelete(id);
  if (!deleted) {
    const err = new Error('BEAN_NOT_FOUND');
    log.error({ err, id, userId }, 'deleteBean failed: bean not found');
    throw err;
  }
  log.debug({ userId, id }, 'deleteBean completed');
}
