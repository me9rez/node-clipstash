import { createApp } from 'vue';
import { router } from './router.js';
import App from './App.vue';
import './style.css';

const savedLayout = localStorage.getItem('clipstash_layout');
if (savedLayout === 'compact') {
  document.documentElement.classList.add('layout-compact');
}

function initTheme() {
  const saved = localStorage.getItem('clipstash_theme') as 'light' | 'dark' | 'system' | null;
  const theme = saved || 'system';

  function apply() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  apply();

  if (theme === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  }
}

initTheme();

createApp(App).use(router).mount('#app');
