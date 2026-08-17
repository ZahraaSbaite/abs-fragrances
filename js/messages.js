const Messages = (() => {
  async function fetchAll(token) {
    const res = await fetch(`${API_BASE}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch messages');
    return data.messages;
  }
  async function deleteMessage(id, token) {
    const res = await fetch(`${API_BASE}/messages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete message');
    return data;
  }
  async function submitMessage({ name, email, phone, inquiry_type, message_text }) {
    const res = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone: phone || '', inquiry_type, message_text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.message;
  }
  return { fetchAll, deleteMessage, submitMessage };
})();
window.Messages = Messages;
