<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from './useAuth.js';
import { useRouter } from 'vue-router';
import { Sun, Moon } from '@lucide/vue';

const { isAuthenticated, currentUser, logout } = useAuth();
const router = useRouter();

function getResolvedTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('clipstash_theme') as 'light' | 'dark' | 'system' | null;
  const mode = saved || 'system';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

const currentTheme = ref<'light' | 'dark'>(getResolvedTheme());

function toggleTheme() {
  const next = currentTheme.value === 'light' ? 'dark' : 'light';
  currentTheme.value = next;
  localStorage.setItem('clipstash_theme', next);
  document.documentElement.setAttribute('data-theme', next);
}
</script>

<template>
  <nav v-if="isAuthenticated" class="nav-bar">
    <span class="nav-brand" @click="router.push('/')" style="cursor:pointer">Clipstash</span>
    <div class="nav-actions">
      <span class="nav-user">{{ currentUser?.username }}</span>
      <button class="icon-btn nav-theme-btn" @click="toggleTheme" :title="currentTheme === 'light' ? '切换深色模式' : '切换浅色模式'">
        <Sun v-if="currentTheme === 'dark'" :size="16" />
        <Moon v-else :size="16" />
      </button>
      <button class="btn-ghost nav-btn" @click="router.push('/settings')">
        设置
      </button>
      <button
        v-if="currentUser?.is_admin"
        class="btn-ghost nav-btn"
        @click="router.push('/admin')"
      >
        管理
      </button>
      <button class="btn-ghost nav-btn" @click="logout(); router.push('/login')">
        退出
      </button>
    </div>
  </nav>

  <router-view />
</template>

<style scoped>
.nav-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.nav-brand {
  font-weight: 700;
  font-size: 16px;
  color: var(--color-accent);
  letter-spacing: 0.03em;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-user {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.nav-btn {
  font-size: 13px;
  padding: 4px 12px;
}

.nav-theme-btn {
  color: var(--color-text-secondary);
}

.nav-theme-btn:hover {
  color: var(--color-accent);
}
</style>
