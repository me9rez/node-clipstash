<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  fetchItems,
  fetchStats,
  updateItem,
  deleteItem as deleteItemApi,
} from './api.js';

const items = ref([]);
const stats = ref(null);
const loading = ref(false);
const error = ref('');

const q = ref('');
const type = ref('all');
const status = ref('all');

const limit = ref(50);
const offset = ref(0);
const total = ref(0);

const editingId = ref(null);
const editingNote = ref('');
const editingTags = ref('');

const hasPrev = computed(() => offset.value > 0);
const hasNext = computed(() => offset.value + limit.value < total.value);

const pageText = computed(() => {
  if (total.value === 0) return '0 / 0';

  const start = offset.value + 1;
  const end = Math.min(offset.value + limit.value, total.value);

  return `${start}-${end} / ${total.value}`;
});

let searchTimer = null;

watch([q, type, status], () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    offset.value = 0;
    loadItems();
  }, 250);
});

onMounted(async () => {
  await Promise.all([
    loadStats(),
    loadItems(),
  ]);
});

async function loadStats() {
  try {
    stats.value = await fetchStats();
  } catch (err) {
    console.error(err);
  }
}

async function loadItems() {
  loading.value = true;
  error.value = '';

  try {
    const result = await fetchItems({
      q: q.value,
      type: type.value,
      status: status.value,
      limit: limit.value,
      offset: offset.value,
    });

    items.value = result.items;
    total.value = result.total;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function openUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function setStatus(item, nextStatus) {
  const updated = await updateItem(item.id, {
    status: nextStatus,
  });

  replaceItem(updated);
  await loadStats();
}

function startEdit(item) {
  editingId.value = item.id;
  editingNote.value = item.note || '';
  editingTags.value = item.tags || '';
}

function cancelEdit() {
  editingId.value = null;
  editingNote.value = '';
  editingTags.value = '';
}

async function saveEdit(item) {
  const updated = await updateItem(item.id, {
    note: editingNote.value,
    tags: editingTags.value,
  });

  replaceItem(updated);
  cancelEdit();
}

async function removeItem(item) {
  const confirmed = window.confirm(`确定删除：${item.title || item.url}？`);

  if (!confirmed) return;

  await deleteItemApi(item.id);
  await Promise.all([
    loadStats(),
    loadItems(),
  ]);
}

function replaceItem(updated) {
  const index = items.value.findIndex((item) => item.id === updated.id);

  if (index !== -1) {
    items.value[index] = updated;
  }
}

function prevPage() {
  if (!hasPrev.value) return;

  offset.value = Math.max(0, offset.value - limit.value);
  loadItems();
}

function nextPage() {
  if (!hasNext.value) return;

  offset.value += limit.value;
  loadItems();
}

function formatDate(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function hostLabel(item) {
  if (item.type === 'github-repo') {
    return item.owner && item.repo ? `${item.owner}/${item.repo}` : item.host;
  }

  return item.host;
}
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Clipstash</p>
        <h1>剪贴板收藏库</h1>
        <p class="subtitle">
          自动捕获你复制过的 GitHub 仓库、博客文章和有价值链接。
        </p>
      </div>

      <div class="stats" v-if="stats">
        <div class="stat-card">
          <span>总收藏</span>
          <strong>{{ stats.total }}</strong>
        </div>

        <div class="stat-card">
          <span>GitHub</span>
          <strong>
            {{ stats.byType.find((item) => item.type === 'github-repo')?.count || 0 }}
          </strong>
        </div>

        <div class="stat-card">
          <span>未读</span>
          <strong>
            {{ stats.byStatus.find((item) => item.status === 'unread')?.count || 0 }}
          </strong>
        </div>
      </div>
    </header>

    <section class="toolbar">
      <input
        v-model="q"
        class="search"
        placeholder="搜索 title / URL / owner / repo / tags / note..."
      />

      <select v-model="type">
        <option value="all">全部类型</option>
        <option value="github-repo">GitHub 仓库</option>
        <option value="url">普通链接</option>
      </select>

      <select v-model="status">
        <option value="all">全部状态</option>
        <option value="unread">未读</option>
        <option value="read">已读</option>
        <option value="archived">已归档</option>
      </select>

      <button @click="loadItems" :disabled="loading">
        刷新
      </button>
    </section>

    <p v-if="error" class="error">
      {{ error }}
    </p>

    <section class="list">
      <article
        v-for="item in items"
        :key="item.id"
        class="item-card"
        :class="{ archived: item.status === 'archived' }"
      >
        <div class="item-main">
          <div class="item-top">
            <span class="badge" :class="item.type">
              {{ item.type === 'github-repo' ? 'GitHub' : 'URL' }}
            </span>

            <span class="status" :class="item.status">
              {{ item.status }}
            </span>

            <span class="seen">
              copied {{ item.seen_count }}x
            </span>
          </div>

          <h2>
            {{ item.title || item.url }}
          </h2>

          <p class="url">
            {{ item.url }}
          </p>

          <div class="meta">
            <span>{{ hostLabel(item) }}</span>
            <span>首次：{{ formatDate(item.first_seen_at) }}</span>
            <span>最近：{{ formatDate(item.last_seen_at) }}</span>
          </div>

          <div v-if="item.tags" class="tags">
            {{ item.tags }}
          </div>

          <p v-if="item.note" class="note">
            {{ item.note }}
          </p>

          <div v-if="editingId === item.id" class="editor">
            <input
              v-model="editingTags"
              placeholder="tags，例如：frontend, read-later"
            />

            <textarea
              v-model="editingNote"
              rows="4"
              placeholder="写一点备注..."
            />

            <div class="actions">
              <button class="primary" @click="saveEdit(item)">
                保存
              </button>
              <button @click="cancelEdit">
                取消
              </button>
            </div>
          </div>
        </div>

        <div class="item-actions">
          <button class="primary" @click="openUrl(item.url)">
            打开
          </button>

          <button
            v-if="item.status !== 'read'"
            @click="setStatus(item, 'read')"
          >
            标为已读
          </button>

          <button
            v-if="item.status !== 'unread'"
            @click="setStatus(item, 'unread')"
          >
            标为未读
          </button>

          <button
            v-if="item.status !== 'archived'"
            @click="setStatus(item, 'archived')"
          >
            归档
          </button>

          <button @click="startEdit(item)">
            备注
          </button>

          <button class="danger" @click="removeItem(item)">
            删除
          </button>
        </div>
      </article>

      <div v-if="!loading && items.length === 0" class="empty">
        暂无收藏。复制一个 GitHub 仓库链接或文章链接试试。
      </div>
    </section>

    <footer class="pager">
      <button @click="prevPage" :disabled="!hasPrev">
        上一页
      </button>

      <span>{{ pageText }}</span>

      <button @click="nextPage" :disabled="!hasNext">
        下一页
      </button>
    </footer>
  </main>
</template>