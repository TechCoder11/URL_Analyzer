window.addEventListener('DOMContentLoaded', () => {
  const urlbar = document.getElementById('urlbar');
  const go = document.getElementById('go');
  const view = document.getElementById('view');
  const back = document.getElementById('back');
  const forward = document.getElementById('forward');
  const status = document.getElementById('status');

  go.addEventListener('click', () => {
    let url = urlbar.value.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    view.src = url;
  });

  back.addEventListener('click', () => {
    try { view.contentWindow.history.back(); } catch(e){ console.error('Back error', e); }
  });

  forward.addEventListener('click', () => {
    try { view.contentWindow.history.forward(); } catch(e){ console.error('Forward error', e); }
  });

  // ipc events from main.js
  if (window.electronAPI) {
    window.electronAPI.onExtensionLoaded((ext) => {
      console.log('Renderer: extension-loaded', ext);
      status.textContent = `Loaded extension: ${ext.name} (${ext.id})`;
    });
    window.electronAPI.onExtensionsCleared(() => {
      console.log('Renderer: extensions-cleared');
      status.textContent = 'No extension loaded';
    });
  } else {
    console.warn('Renderer: electronAPI not available (preload not loaded?)');
    status.textContent = 'Preload missing';
  }
});
