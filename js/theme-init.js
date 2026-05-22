let theme = localStorage.getItem('ui_theme') || 'dark';

if (theme === 'system') {
  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

document.documentElement.setAttribute('data-theme', theme);
document.documentElement.style.background = theme === 'light' ? '#ffffff' : '#111827';

document.documentElement.classList.add('no-transition');
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.documentElement.classList.remove('no-transition');
  }, 50);
});