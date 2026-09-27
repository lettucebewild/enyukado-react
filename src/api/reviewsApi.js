import { apiClient } from './client.js';

export function getReviewsForUser(userId) {
  return apiClient.get(`/reviews/user/${userId}`);
}
