import * as model from './model.ts';
import { PaginationSchema } from '@brewform/shared/schemas';

export async function listBeans(userId: string, page: number, perPage: number) {
  return model.findByUser(userId, page, perPage);
}

export async function getBean(id: string) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  return bean;
}

export async function createBean(userId: string, data: any) {
  return model.create({ ...data, userId });
}

export async function updateBean(userId: string, id: string, data: any) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  if (bean.userId !== userId) throw new Error('FORBIDDEN');
  return model.update(id, data);
}

export async function deleteBean(userId: string, id: string) {
  const bean = await model.findById(id);
  if (!bean) throw new Error('BEAN_NOT_FOUND');
  if (bean.userId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}