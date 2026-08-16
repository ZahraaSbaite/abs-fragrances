const Reviews = (() => {
  async function fetchAll() {
    const res = await fetch(`${API_BASE}/reviews`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch reviews');
    return data.reviews;
  }
  async function deleteReview(id, token) {
    const res = await fetch(`${API_BASE}/reviews/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete review');
    return data;
  }
  return { fetchAll, deleteReview };
})();
window.Reviews = Reviews;
