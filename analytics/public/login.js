document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('password').value }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) location.href = '/';
  else document.getElementById('error').textContent = data.error || 'Login failed';
});
