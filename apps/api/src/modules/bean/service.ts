/**
 * Coffee bean business logic for BrewForm.
 *
 * Orchestrates bean CRUD with ownership verification — only the bean owner
 * may update or delete a record.
 */
import * as model from './model.ts';

/** List paginated beans for the authenticated user. */
export async function listBeans(userId: string, page: number, perPage: number) {
  return model.findByUser(userId, page, perPage);
}

/** Get a bean by ID. Throws BEAN_NOT_FOUND if it doesn't exist. */
export async function getBean(id: string) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  return bean;
}

/** Create a new bean owned by the authenticated user. */
export async function createBean(userId: string, data: any) {
  return model.create({ ...data, userId });
}

/**
 * Update a bean. Only the owner may update.
 *
 * @throws BEAN_NOT_FOUND if the bean doesn't exist
 * @throws FORBIDDEN if the user doesn't own the bean
 */
export async function updateBean(userId: string, id: string, data: any) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  if (bean.userId !== userId) throw new Error('FORBIDDEN');
  return model.update(id, data);
}

/**
 * Soft-delete a bean. Only the owner may delete.
 *
 * @throws BEAN_NOT_FOUND if the bean doesn't exist
 * @throws FORBIDDEN if the user doesn't own the bean
 */
export async function deleteBean(userId: string, id: string) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  if (bean.userId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}
