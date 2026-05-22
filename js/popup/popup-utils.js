export function escapeHtml(str) {
  return (str||'').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--text); color:var(--bg); padding:10px 20px; border-radius:30px; font-size:14px; font-weight:bold; z-index:9999; box-shadow:0 10px 30px var(--shadow); white-space:nowrap;`;
  t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
}
