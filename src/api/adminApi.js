import { apiClient } from './client.js';

// Admin session is stored separately from the student session (userToken),
// so logging in as admin never overwrites a student login in the same browser.
const KEY = 'adminSession';
export const getAdminSession = () => {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
};
export const setAdminSession = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export const clearAdminSession = () => localStorage.removeItem(KEY);

const auth = () => ({ token: getAdminSession()?.token });

export const adminLogin = (email, password) =>
  apiClient.post('/users/admin-login', { email, password });

// kind: 'accounts' | 'listings' | 'payments'
export const getCounts = () => apiClient.get('/admin/counts', auth());
export const getPending = (kind) => apiClient.get(`/admin/${kind}/pending`, auth());
export const approve = (kind, id) => apiClient.patch(`/admin/${kind}/${id}/approve`, undefined, auth());
export const reject = (kind, id, reason) => apiClient.patch(`/admin/${kind}/${id}/reject`, { reason }, auth());
