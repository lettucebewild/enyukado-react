import { apiClient } from './client.js';

export function login({ email, password }) {
  return apiClient.post('/users/login', { email, password });
}

export function register({ firstName, lastName, email, password, phoneNumber }) {
  return apiClient.post('/users/register', { firstName, lastName, email, password, phoneNumber });
}

export function requestPasswordResetCode({ identifier }) {
  return apiClient.post('/users/forgot-password', { identifier });
}

export function verifyPasswordResetCode({ identifier, code }) {
  return apiClient.post('/users/verify-reset-code', { identifier, code });
}

export function resetPassword({ identifier, code, newPassword }) {
  return apiClient.put('/users/reset-password', { identifier, code, newPassword });
}
