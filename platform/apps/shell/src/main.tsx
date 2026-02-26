import('./bootstrap').catch((err) => {
  console.error('[oasis] Failed to load bootstrap:', err);
  document.getElementById('app-skeleton')?.remove();
  document.getElementById('root')!.innerHTML =
    '<div style="padding:2rem;font-family:system-ui"><h2>Failed to load application</h2><pre style="color:red;white-space:pre-wrap">' +
    String(err) +
    '</pre><p>Try refreshing the page.</p></div>';
});
