let theme = localStorage.getItem('ui_theme') || 'dark';

// 如果是跟随系统，检测系统主题
if (theme === 'system') {
  theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

document.documentElement.setAttribute('data-theme', theme);
document.documentElement.style.background = theme === 'light' ? '#ffffff' : '#111827';