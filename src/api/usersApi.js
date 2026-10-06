import { apiClient } from './client.js';

export function getUser(id) {
  return apiClient.get(`/users/${id}`);
}

export function changePassword(body, token) {
  return apiClient.put('/users/change-password', body, { token });
}

export function updateProfile(body, token) {
  return apiClient.put('/users/profile', body, { token });
}

export function uploadQRCode(file, token) {
  const fd = new FormData();
  fd.append('qrCode', file);
  return apiClient.postForm('/users/qr', fd, { token });
}

export function uploadProfilePhoto(file, token) {
  const fd = new FormData();
  fd.append('profilePhoto', file);
  return apiClient.postForm('/users/photo', fd, { token });
}
