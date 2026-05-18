<script setup lang="ts">
import { useAuth } from './useAuth.js';
import { useRouter } from 'vue-router';

const { isAuthenticated, currentUser, logout } = useAuth();
const router = useRouter();
</script>

<template>
  <nav v-if="isAuthenticated" class="nav-bar">
    <span class="nav-brand" @click="router.push('/')" style="cursor:pointer">Clipstash</span>
    <div class="nav-actions">
      <span class="nav-user">{{ currentUser?.username }}</span>
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
  background: #FEFDFB;
  border-bottom: 1px solid #E8E0D8;
}

.nav-brand {
  font-weight: 700;
  font-size: 16px;
  color: #DA7756;
  letter-spacing: 0.03em;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-user {
  font-size: 14px;
  color: #5C4F42;
}

.nav-btn {
  font-size: 13px;
  padding: 4px 12px;
}
</style>
