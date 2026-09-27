import { apiClient } from './client.js';

export function login({ email, password }) {
  return apiClient.post('/users/login', { email, password });
}

export function register({ firstName, lastName, email, password }) {
  return apiClient.post('/users/register', { firstName, lastName, email, password });
}
