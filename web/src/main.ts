import { createApp } from 'vue';
import { router } from './router.js';
import App from './App.vue';
import './style.css';

const savedLayout = localStorage.getItem('clipstash_layout');
if (savedLayout === 'compact') {
  document.documentElement.classList.add('layout-compact');
}

createApp(App).use(router).mount('#app');
