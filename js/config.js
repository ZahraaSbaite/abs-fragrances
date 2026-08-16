/**
 * ABS FRAGRANCES — config.js
 * Must load before auth.js on every page. Points the frontend at the
 * right backend depending on where it's running: localhost during dev,
 * the deployed API once this site is live.
 */
window.API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000/api'
  : 'https://abs-fragrances.onrender.com/api';
