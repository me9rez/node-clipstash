<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  fetchUsers,
  createUser,
  deleteUser,
  changeUserPassword,
  fetchTokens,
  createToken,
  deleteToken,
} from './api.js';
import type { UserListItem, TokenItem } from './api.js';

const router = useRouter();

const users = ref<UserListItem[]>([]);
const tokens = ref<TokenItem[]>([]);
const newUsername = ref('');
const newPassword = ref('');
const tokenName = ref('');
const newToken = ref<string | null>(null);
const error = ref('');

const showNewTokenModal = ref(false);

const changingUserId = ref<number | null>(null);
const changingPassword = ref('');

async function loadData() {
  try {
    const [u, t] = await Promise.all([fetchUsers(), fetchTokens()]);
    users.value = u;
    tokens.value = t;
  } catch (err) {
    error.value = (err as Error).message;
  }
}

onMounted(loadData);

async function handleCreateUser() {
  error.value = '';

  if (!newUsername.value.trim()) {
    error.value = '用户名不能为空';
    return;
  }

  if (!newPassword.value || newPassword.value.length < 6) {
    error.value = '密码至少 6 个字符';
    return;
  }

  try {
    await createUser(newUsername.value.trim(), newPassword.value);
    newUsername.value = '';
    newPassword.value = '';
    await loadData();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function handleDeleteUser(id: number, username: string) {
  if (!window.confirm(`确定删除用户 ${username}？`)) return;

  try {
    await deleteUser(id);
    await loadData();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function startChangePassword(userId: number) {
  changingUserId.value = userId;
  changingPassword.value = '';
}

function cancelChangePassword() {
  changingUserId.value = null;
  changingPassword.value = '';
}

async function handleChangeUserPassword(userId: number, username: string) {
  error.value = '';

  if (!changingPassword.value || changingPassword.value.length < 6) {
    error.value = '密码至少 6 个字符';
    return;
  }

  try {
    await changeUserPassword(userId, changingPassword.value);
    changingUserId.value = null;
    changingPassword.value = '';
    alert(`用户 ${username} 密码已修改`);
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function handleCreateToken() {
  error.value = '';

  try {
    const result = await createToken(tokenName.value.trim() || 'API Token');
    newToken.value = result.token;
    tokenName.value = '';
    showNewTokenModal.value = true;
    await loadData();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

async function handleDeleteToken(id: number) {
  if (!window.confirm('确定删除此令牌？')) return;

  try {
    await deleteToken(id);
    await loadData();
  } catch (err) {
    error.value = (err as Error).message;
  }
}

function copyToken(token: string) {
  navigator.clipboard.writeText(token).then(() => {
    alert('令牌已复制到剪贴板');
  }).catch(() => {
    prompt('请手动复制令牌:', token);
  });
}

function closeNewToken() {
  showNewTokenModal.value = false;
  newToken.value = null;
}
</script>

<template>
  <div class="admin-panel">
    <h2>管理面板</h2>

    <p v-if="error" class="admin-error">{{ error }}</p>

    <section class="admin-section">
      <h3>用户管理</h3>

      <div class="admin-create-row">
        <input
          v-model="newUsername"
          placeholder="用户名"
          class="admin-input"
        />
        <input
          v-model="newPassword"
          type="password"
          placeholder="密码 (至少6位)"
          class="admin-input"
        />
        <button class="btn-primary admin-btn-sm" @click="handleCreateUser">
          创建用户
        </button>
      </div>

      <ul class="admin-list" v-if="users.length > 0">
        <li v-for="user in users" :key="user.id" class="admin-list-item">
          <span>
            <strong>{{ user.username }}</strong>
            <span v-if="user.is_admin" class="admin-badge">管理员</span>
            <span class="admin-date">{{ user.created_at?.slice(0, 10) }}</span>
          </span>
          <span class="user-actions">
            <button
              class="btn-ghost admin-btn-sm"
              @click="startChangePassword(user.id)"
            >
              修改密码
            </button>
            <button
              class="btn-danger-ghost admin-btn-sm"
              @click="handleDeleteUser(user.id, user.username)"
            >
              删除
            </button>
          </span>
        </li>
      </ul>

      <div v-if="changingUserId !== null" class="password-change-row">
        <input
          v-model="changingPassword"
          type="password"
          placeholder="新密码 (至少6位)"
          class="admin-input"
        />
        <button
          class="btn-primary admin-btn-sm"
          @click="handleChangeUserPassword(changingUserId, users.find(u => u.id === changingUserId)?.username || '')"
        >
          确认修改
        </button>
        <button class="btn-ghost admin-btn-sm" @click="cancelChangePassword">
          取消
        </button>
      </div>
    </section>

    <section class="admin-section">
      <h3>令牌管理</h3>

      <div class="admin-create-row">
        <input
          v-model="tokenName"
          placeholder="令牌名称 (可选)"
          class="admin-input"
        />
        <button class="btn-primary admin-btn-sm" @click="handleCreateToken">
          生成令牌
        </button>
      </div>

      <ul class="admin-list" v-if="tokens.length > 0">
        <li v-for="t in tokens" :key="t.id" class="admin-list-item">
          <span class="token-info">
            <strong>{{ t.name }}</strong>
            <code class="token-preview">{{ t.token.slice(0, 12) }}...</code>
            <span class="admin-date">{{ t.created_at?.slice(0, 10) }}</span>
          </span>
          <span class="token-actions">
            <button class="btn-ghost admin-btn-sm" @click="copyToken(t.token)">
              复制
            </button>
            <button
              class="btn-danger-ghost admin-btn-sm"
              @click="handleDeleteToken(t.id)"
            >
              删除
            </button>
          </span>
        </li>
      </ul>
    </section>

    <div v-if="showNewTokenModal" class="token-reveal">
      <div class="token-reveal-card">
        <p class="token-reveal-warn">请立即复制并保存此令牌，关闭后将无法再次查看：</p>
        <code class="token-full">{{ newToken }}</code>
        <div class="token-reveal-actions">
          <button class="btn-primary admin-btn-sm" @click="copyToken(newToken!)">
            复制到剪贴板
          </button>
          <button class="btn-ghost admin-btn-sm" @click="closeNewToken">
            已保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-panel {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  padding: 32px;
}

.admin-panel h2 {
  margin: 0 0 20px;
  font-size: 22px;
}

.admin-error {
  color: var(--color-danger);
  font-size: 13px;
  margin: 0 0 12px;
}

.admin-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.admin-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--color-text-secondary);
}

.admin-create-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.admin-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
  flex: 1;
  min-width: 0;
}

.admin-input:focus {
  border-color: var(--color-accent);
}

.admin-btn-sm {
  padding: 6px 14px;
  font-size: 13px;
  white-space: nowrap;
}

.admin-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.admin-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-light);
  gap: 8px;
}

.admin-list-item:last-child {
  border-bottom: none;
}

.admin-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  background: var(--color-orange-bg);
  color: var(--color-accent);
  border-radius: 4px;
  vertical-align: middle;
}

.admin-date {
  margin-left: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.user-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.password-change-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 0;
  border-top: 1px dashed var(--color-border);
}

.token-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.token-preview {
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-note-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.token-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.token-reveal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 200;
}

.token-reveal-card {
  background: var(--color-surface);
  padding: 32px;
  border-radius: 12px;
  max-width: 480px;
  text-align: center;
}

.token-reveal-warn {
  color: var(--color-accent);
  font-weight: 600;
  margin: 0 0 16px;
}

.token-full {
  display: block;
  padding: 12px;
  background: var(--color-note-bg);
  border-radius: 6px;
  font-size: 14px;
  word-break: break-all;
  font-family: monospace;
  margin-bottom: 16px;
}

.token-reveal-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
</style>
