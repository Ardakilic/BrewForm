/**
 * Mock API Tests
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import apiDefault, { api } from './api.ts';

describe('Mock API', () => {
  it('has get method', () => {
    expect(typeof api.get).toBe('function');
  });

  it('has post method', () => {
    expect(typeof api.post).toBe('function');
  });

  it('has put method', () => {
    expect(typeof api.put).toBe('function');
  });

  it('has patch method', () => {
    expect(typeof api.patch).toBe('function');
  });

  it('has delete method', () => {
    expect(typeof api.delete).toBe('function');
  });

  it('default export has all methods', () => {
    expect(typeof apiDefault.get).toBe('function');
    expect(typeof apiDefault.post).toBe('function');
    expect(typeof apiDefault.put).toBe('function');
    expect(typeof apiDefault.patch).toBe('function');
    expect(typeof apiDefault.delete).toBe('function');
  });

  it('get returns resolved promise', async () => {
    const result = await api.get();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('post returns resolved promise', async () => {
    const result = await api.post();
    expect(result.data).toBeNull();
  });

  it('put returns resolved promise', async () => {
    const result = await api.put();
    expect(result.data).toBeNull();
  });

  it('patch returns resolved promise', async () => {
    const result = await api.patch();
    expect(result.data).toBeNull();
  });

  it('delete returns resolved promise', async () => {
    const result = await api.delete();
    expect(result.data).toBeNull();
  });
});
