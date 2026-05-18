<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  fetchItems,
  fetchStats,
  updateItem,
  deleteItem as deleteItemApi,
} from '../api.js';
import type { Item, Stats } from '../api.js';
import { useAuth } from '../useAuth.js';

const { currentUser } = useAuth();

const items = ref<Item[]>([]);
const stats = ref<Stats | null>(null);
const loading = ref(false);
const error = ref('');

const q = ref('');
const type = ref('all');
const status = ref('all');

const limit = ref(50);
const offset = ref(0);
const total = ref(0);

const editingId = ref<number | null>(null);
const editingNote = ref('');
const editingTags = ref('');

const viewMode = ref('flat');

const hasPrev = computed(() => offset.value > 0);
const hasNext = computed(() => offset.value + limit.value < total.value);

const pageText = computed(() => {
  if (total.value === 0) return '0 / 0';
  const start = offset.value + 1;
  const end = Math.min(offset.value + limit.value, total.value);
  return `${start}-${end} / ${total.value}`;
});

const githubCount = computed(() =>
  stats.value?.byType.find((item) => item.type === 'github-repo')?.count || 0
);

const unreadCount = computed(() =>
  stats.value?.byStatus.find((item) => item.status === 'unread')?.count || 0
);

const groupedItems = computed(() => {
  const groups = new Map<string, Item[]>();
  for (const item of items.value) {
    const dateKey = item.first_seen_at
      ? item.first_seen_at.slice(0, 10)
      : '__unknown__';
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(item);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  return sorted.map(([dateKey, group]) => ({
    dateKey,
    label: formatGroupDate(group[0].first_seen_at),
    count: group.length,
    items: group,
  }));
});

function formatGroupDate(dateStr: string | null) {
  if (!dateStr) return '未知日期';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return '今天';
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch([q, type, status], () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset.value = 0;
    loadItems();
  }, 250);
});

onMounted(async () => {
  await Promise.all([loadStats(), loadItems()]);
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
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function setStatus(item: Item, nextStatus: Item['status']) {
  const updated = await updateItem(item.id, { status: nextStatus });
  replaceItem(updated);
  await loadStats();
}

function startEdit(item: Item) {
  editingId.value = item.id;
  editingNote.value = item.note || '';
  editingTags.value = item.tags || '';
}

function cancelEdit() {
  editingId.value = null;
  editingNote.value = '';
  editingTags.value = '';
}

async function saveEdit(item: Item) {
  const updated = await updateItem(item.id, {
    note: editingNote.value,
    tags: editingTags.value,
  });
  replaceItem(updated);
  cancelEdit();
}

async function removeItem(item: Item) {
  const confirmed = window.confirm(`确定删除：${item.title || item.url}？`);
  if (!confirmed) return;
  await deleteItemApi(item.id);
  await Promise.all([loadStats(), loadItems()]);
}

function replaceItem(updated: Item) {
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

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function hostLabel(item: Item) {
  if (item.type === 'github-repo') {
    return item.owner && item.repo ? `${item.owner}/${item.repo}` : item.host || '';
  }
  return item.host || '';
}

function splitTags(tags: string | null) {
  if (!tags) return [];
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <h1>剪贴板收藏库</h1>
      <p class="subtitle">
        自动捕获你复制过的 GitHub 仓库、博客文章和有价值链接。
      </p>
      <p v-if="stats" class="inline-stats">
        <span>总收藏 <strong>{{ stats.total }}</strong></span>
        <span class="stat-sep">·</span>
        <span>GitHub <strong>{{ githubCount }}</strong></span>
        <span class="stat-sep">·</span>
        <span>未读 <strong>{{ unreadCount }}</strong></span>
      </p>
    </header>

    <div class="toolbar">
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
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
      <div class="view-toggle">
        <button :class="{ active: viewMode === 'flat' }" @click="viewMode = 'flat'">
          平铺
        </button>
        <button :class="{ active: viewMode === 'grouped' }" @click="viewMode = 'grouped'">
          按天
        </button>
      </div>
    </div>

    <div class="list-wrapper">
      <p v-if="error" class="error">{{ error }}</p>

      <section class="list">
        <template v-if="viewMode === 'flat'">
          <article
            v-for="item in items"
            :key="item.id"
            class="item-card"
            :class="{ archived: item.status === 'archived' }"
          >
            <div class="item-meta">
              <span class="badge" :class="item.type">
                {{ item.type === 'github-repo' ? 'GitHub' : 'URL' }}
              </span>
              <span class="status-dot" :class="item.status"></span>
              <span class="meta-text">{{ hostLabel(item) }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-text">copied {{ item.seen_count }}x</span>
              <span class="meta-sep">·</span>
              <span class="meta-text">{{ formatDate(item.first_seen_at) }}</span>
              <span class="meta-sep">·</span>
              <span class="meta-text">{{ formatDate(item.last_seen_at) }}</span>
            </div>

            <h2 class="item-title">
              <a href="#" @click.prevent="openUrl(item.url)">
                {{ item.title || item.url }}
              </a>
            </h2>

            <p class="item-url">{{ item.url }}</p>

            <div class="item-tags" v-if="item.tags">
              <span v-for="tag in splitTags(item.tags)" :key="tag" class="tag">
                #{{ tag }}
              </span>
            </div>

            <p v-if="item.note && editingId !== item.id" class="item-note">
              {{ item.note }}
            </p>

            <div v-if="editingId === item.id" class="item-editor">
              <input v-model="editingTags" placeholder="tags，例如：frontend, read-later" />
              <textarea v-model="editingNote" rows="3" placeholder="写一点备注..." />
              <div class="editor-actions">
                <button class="btn-primary" @click="saveEdit(item)">保存</button>
                <button class="btn-ghost" @click="cancelEdit">取消</button>
              </div>
            </div>

            <div class="item-actions">
              <button class="btn-primary" @click="openUrl(item.url)">打开</button>
              <button v-if="item.status !== 'read'" class="btn-ghost" @click="setStatus(item, 'read')">
                已读
              </button>
              <button v-if="item.status !== 'unread'" class="btn-ghost" @click="setStatus(item, 'unread')">
                未读
              </button>
              <button v-if="item.status !== 'archived'" class="btn-ghost" @click="setStatus(item, 'archived')">
                归档
              </button>
              <button class="btn-ghost" @click="startEdit(item)">备注</button>
              <button class="btn-danger-ghost" @click="removeItem(item)">删除</button>
            </div>
          </article>
        </template>

        <template v-else>
          <template v-for="group in groupedItems" :key="group.dateKey">
            <div class="date-header">
              <span class="date-label">{{ group.label }}</span>
              <span class="date-count">{{ group.count }} 条</span>
            </div>
            <article
              v-for="item in group.items"
              :key="item.id"
              class="item-card"
              :class="{ archived: item.status === 'archived' }"
            >
              <div class="item-meta">
                <span class="badge" :class="item.type">
                  {{ item.type === 'github-repo' ? 'GitHub' : 'URL' }}
                </span>
                <span class="status-dot" :class="item.status"></span>
                <span class="meta-text">{{ hostLabel(item) }}</span>
                <span class="meta-sep">·</span>
                <span class="meta-text">copied {{ item.seen_count }}x</span>
              </div>

              <h2 class="item-title">
                <a href="#" @click.prevent="openUrl(item.url)">
                  {{ item.title || item.url }}
                </a>
              </h2>

              <p class="item-url">{{ item.url }}</p>

              <div class="item-tags" v-if="item.tags">
                <span v-for="tag in splitTags(item.tags)" :key="tag" class="tag">
                  #{{ tag }}
                </span>
              </div>

              <p v-if="item.note && editingId !== item.id" class="item-note">
                {{ item.note }}
              </p>

              <div v-if="editingId === item.id" class="item-editor">
                <input v-model="editingTags" placeholder="tags，例如：frontend, read-later" />
                <textarea v-model="editingNote" rows="3" placeholder="写一点备注..." />
                <div class="editor-actions">
                  <button class="btn-primary" @click="saveEdit(item)">保存</button>
                  <button class="btn-ghost" @click="cancelEdit">取消</button>
                </div>
              </div>

              <div class="item-actions">
                <button class="btn-primary" @click="openUrl(item.url)">打开</button>
                <button v-if="item.status !== 'read'" class="btn-ghost" @click="setStatus(item, 'read')">
                  已读
                </button>
                <button v-if="item.status !== 'unread'" class="btn-ghost" @click="setStatus(item, 'unread')">
                  未读
                </button>
                <button v-if="item.status !== 'archived'" class="btn-ghost" @click="setStatus(item, 'archived')">
                  归档
                </button>
                <button class="btn-ghost" @click="startEdit(item)">备注</button>
                <button class="btn-danger-ghost" @click="removeItem(item)">删除</button>
              </div>
            </article>
          </template>
        </template>

        <div v-if="!loading && items.length === 0" class="empty">
          暂无收藏。
          <br />
          复制一个 GitHub 仓库链接或文章链接试试。
        </div>
      </section>
    </div>

    <footer class="pager">
      <button @click="prevPage" :disabled="!hasPrev">&larr; 上一页</button>
      <span class="page-info">{{ pageText }}</span>
      <button @click="nextPage" :disabled="!hasNext">下一页 &rarr;</button>
    </footer>
  </main>
</template>
