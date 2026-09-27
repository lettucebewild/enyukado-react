import { apiClient } from './client.js';

export function getCategories() {
  return apiClient.get('/categories');
}
