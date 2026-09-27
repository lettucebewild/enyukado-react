import { apiClient } from './client.js';

export function getConversations(token) {
  return apiClient.get('/messages/conversations', { token });
}

export function getUnreadCount(token) {
  return apiClient.get('/messages/unread', { token });
}

export function getThread(otherUserID, token) {
  return apiClient.get(`/messages/thread/${otherUserID}`, { token });
}

export function sendMessage(formData, token) {
  return apiClient.postForm('/messages', formData, { token });
}

export function searchUsers(q, token) {
  return apiClient.get(`/messages/search?q=${encodeURIComponent(q)}`, { token });
}
