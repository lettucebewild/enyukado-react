import { apiClient } from './client.js';

export function getSavedItems(token) {
  return apiClient.get('/saved', { token });
}

export function saveItem(productID, token) {
  return apiClient.post('/saved', { productID }, { token });
}

export function unsaveItem(productID, token) {
  return apiClient.del(`/saved/${productID}`, { token });
}

export function checkSaved(productID, token) {
  return apiClient.get(`/saved/check/${productID}`, { token });
}
