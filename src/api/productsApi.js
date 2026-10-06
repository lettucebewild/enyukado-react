import { apiClient } from './client.js';

export function getProducts({ search, category, sort } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (sort) params.set('sort', sort);
  const qs = params.toString();
  return apiClient.get(`/products${qs ? `?${qs}` : ''}`);
}

export function getProduct(id) {
  return apiClient.get(`/products/${id}`);
}

export function getMyListings(token) {
  return apiClient.get('/products/my/listings', { token });
}

export function createProduct(formData, token) {
  return apiClient.postForm('/products/add', formData, { token });
}

export function updateProduct(id, formData, token) {
  return apiClient.putForm(`/products/${id}`, formData, { token });
}

export function deleteProduct(id, token) {
  return apiClient.del(`/products/${id}`, { token });
}
