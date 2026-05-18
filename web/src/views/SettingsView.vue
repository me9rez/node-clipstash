<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { changePassword } from '../api.js';

const router = useRouter();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const success = ref('');
const loading = ref(false);

async function handleChangePassword() {
  error.value = '';
  success.value = '';

  if (!currentPassword.value) {
    error.value = '请输入当前密码';
    return;
  }

  if (!newPassword.value || newPassword.value.length < 6) {
    error.value = '新密码至少 6 个字符';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致';
    return;
  }

  loading.value = true;

  try {
    await changePassword(currentPassword.value, newPassword.value);
    success.value = '密码已修改';
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page">
    <div class="settings-card">
      <button class="back-link" @click="router.push('/')">&larr; 返回</button>

      <h1>修改密码</h1>

      <form class="settings-form" @submit.prevent="handleChangePassword">
        <label>
          <span>当前密码</span>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            :disabled="loading"
          />
        </label>

        <label>
          <span>新密码</span>
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            placeholder="至少 6 个字符"
            :disabled="loading"
          />
        </label>

        <label>
          <span>确认新密码</span>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入新密码"
            :disabled="loading"
          />
        </label>

        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="success" class="form-success">{{ success }}</p>

        <button type="submit" class="btn-primary settings-btn" :disabled="loading">
          {{ loading ? '修改中...' : '修改密码' }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.settings-card {
  max-width: 400px;
  margin: 60px auto 0;
  padding: 40px;
  background: #FEFDFB;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.back-link {
  background: none;
  border: none;
  color: #DA7756;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  margin-bottom: 16px;
  display: inline-block;
}

.back-link:hover {
  color: #C4684A;
}

.settings-card h1 {
  margin: 0 0 24px;
  font-size: 22px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-form label span {
  font-size: 13px;
  font-weight: 600;
  color: #5C4F42;
}

.settings-form input {
  padding: 10px 14px;
  border: 1px solid #D4C8BC;
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
  background: #FAF9F7;
  outline: none;
  transition: border-color 0.15s;
}

.settings-form input:focus {
  border-color: #DA7756;
}

.form-error {
  color: #D44;
  font-size: 13px;
}

.form-success {
  color: #3C763D;
  font-size: 13px;
  background: #EBF4EC;
  padding: 8px 12px;
  border-radius: 6px;
}

.settings-btn {
  margin-top: 8px;
  padding: 12px;
  font-size: 16px;
}
</style>
