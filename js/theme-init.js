const theme = localStorage.getItem('ui_theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
