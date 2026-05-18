<script setup lang="ts">
import { ref } from 'vue';
import { login } from './api.js';
import { setToken, setUser } from './auth.js';
import type { UserInfo } from './api.js';

const emit = defineEmits<{
  authenticated: [user: UserInfo];
}>();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';

  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }

  loading.value = true;

  try {
    const result = await login(username.value.trim(), password.value);

    setToken(result.token);
    setUser(result.user);
    emit('authenticated', result.user);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page">
    <div class="login-card">
      <p class="eyebrow">Clipstash</p>
      <h1>登录</h1>
      <p class="subtitle">输入用户名和密码以访问剪贴板收藏库</p>

      <form class="login-form" @submit.prevent="handleLogin">
        <label>
          <span>用户名</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="admin"
            :disabled="loading"
          />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="loading"
          />
        </label>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button type="submit" class="btn-primary login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.login-card {
  max-width: 400px;
  margin: 80px auto 0;
  padding: 48px 40px;
  background: #FEFDFB;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.login-card .eyebrow {
  text-align: center;
  color: #DA7756;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.login-card h1 {
  text-align: center;
  margin: 0 0 8px;
  font-size: 24px;
}

.login-card .subtitle {
  text-align: center;
  color: #8C7A6B;
  margin: 0 0 32px;
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.login-form label span {
  font-size: 13px;
  font-weight: 600;
  color: #5C4F42;
}

.login-form input {
  padding: 10px 14px;
  border: 1px solid #D4C8BC;
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
  background: #FAF9F7;
  outline: none;
  transition: border-color 0.15s;
}

.login-form input:focus {
  border-color: #DA7756;
}

.login-error {
  color: #D44;
  font-size: 13px;
  margin: -4px 0;
}

.login-btn {
  margin-top: 8px;
  padding: 12px;
  font-size: 16px;
}
</style>
