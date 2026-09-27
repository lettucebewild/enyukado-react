import { apiClient } from './client.js';

export function submitPurchase(formData, token) {
  return apiClient.postForm('/transactions', formData, { token });
}

export function getMyPurchases(token) {
  return apiClient.get('/transactions/my/purchases', { token });
}
