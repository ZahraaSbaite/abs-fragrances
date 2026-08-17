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
  async function submitReview({ stars, review_text, author_name, product_label }) {
    const res = await fetch(`${API_BASE}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stars, review_text, author_name, product_label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit review');
    return data.review;
  }
  return { fetchAll, deleteReview, submitReview };
})();
window.Reviews = Reviews;
