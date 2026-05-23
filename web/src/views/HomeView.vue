<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  RefreshCw,
  List,
  CalendarDays,
  LayoutGrid,
  Globe,
  AlignVerticalJustifyStart,
} from '@lucide/vue';
import {
  fetchItems,
  fetchStats,
  updateItem,
  deleteItem as deleteItemApi,
} from '../api.js';
import type { Item, Stats } from '../api.js';
import { useAuth } from '../useAuth.js';
import { getMainDomain, getSubdomainLabel } from '../domain.js';

const { currentUser } = useAuth();

const items = ref<Item[]>([]);
const stats = ref<Stats | null>(null);
const loading = ref(false);
const error = ref('');

const q = ref('');
const type = ref('all');
const status = ref('all');

const limit = ref(100);
const offset = ref(0);
const total = ref(0);

const editingId = ref<number | null>(null);
const editingNote = ref('');
const editingTags = ref('');

const viewMode = ref('flat');

const compactMode = ref(false);

function toggleCompact() {
  compactMode.value = !compactMode.value;
  document.documentElement.classList.toggle('layout-compact', compactMode.value);
  localStorage.setItem('clipstash_layout', compactMode.value ? 'compact' : 'comfortable');
}

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
interface SourceGroup {
  label: string;
  count: number;
  items: Item[];
  children?: { label: string; items: Item[] }[];
}

const sourceGroupedItems = computed(() => {
  function sortByDateDesc(arr: Item[]): Item[] {
    return [...arr].sort((a, b) => {
      if (!a.first_seen_at) return 1;
      if (!b.first_seen_at) return -1;
      return b.first_seen_at.localeCompare(a.first_seen_at);
    });
  }

  const githubItems = items.value.filter((i) => i.type === 'github-repo');
  const urlItems = items.value.filter((i) => i.type === 'url');

  function makeGithubGroups(list: Item[]): SourceGroup[] {
    const map = new Map<string, Item[]>();
    for (const item of list) {
      const key = item.owner || '未知作者';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupItems]) => ({
        label,
        count: groupItems.length,
        items: sortByDateDesc(groupItems),
      }));
  }

  function makeUrlGroups(list: Item[]): SourceGroup[] {
    const domainMap = new Map<string, { direct: Item[]; subs: Map<string, Item[]> }>();
    for (const item of list) {
      const host = item.host || '';
      const main = getMainDomain(host);
      if (!domainMap.has(main)) {
        domainMap.set(main, { direct: [], subs: new Map() });
      }
      const entry = domainMap.get(main)!;
      const sub = getSubdomainLabel(host);
      if (sub === null) {
        entry.direct.push(item);
      } else {
        if (!entry.subs.has(sub)) entry.subs.set(sub, []);
        entry.subs.get(sub)!.push(item);
      }
    }
    return [...domainMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, { direct, subs }]) => ({
        label,
        count: direct.length + [...subs.values()].reduce((s, arr) => s + arr.length, 0),
        items: sortByDateDesc(direct),
        children: [...subs.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([subLabel, subItems]) => ({
            label: subLabel,
            items: sortByDateDesc(subItems),
          })),
      }));
  }

  const result: SourceGroup[] = [];

  if (type.value === 'all') {
    if (githubItems.length > 0) {
      result.push({ label: 'GitHub', count: githubItems.length, items: [] });
      result.push(...makeGithubGroups(githubItems));
    }
    if (urlItems.length > 0) {
      result.push({ label: '链接', count: urlItems.length, items: [] });
      result.push(...makeUrlGroups(urlItems));
    }
  } else if (type.value === 'github-repo') {
    result.push(...makeGithubGroups(githubItems));
  } else if (type.value === 'url') {
    result.push(...makeUrlGroups(urlItems));
  }

  return result;
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

watch(viewMode, (v) => {
  localStorage.setItem('clipstash_view', v);
});

watch([q, type, status], () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset.value = 0;
    loadItems();
  }, 250);
});

onMounted(async () => {
  const saved = localStorage.getItem('clipstash_layout');
  if (saved === 'compact') {
    compactMode.value = true;
    document.documentElement.classList.add('layout-compact');
  }
  const savedView = localStorage.getItem('clipstash_view');
  if (savedView === 'grouped' || savedView === 'grid' || savedView === 'source') {
    viewMode.value = savedView;
  }
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
      <button class="icon-btn" @click="loadItems" :disabled="loading" title="刷新">
        <RefreshCw :size="16" />
      </button>
      <div class="toolbar-right">
        <div class="view-toggle">
          <button :class="{ active: viewMode === 'flat' }" @click="viewMode = 'flat'" title="平铺">
            <List :size="16" />
          </button>
          <button :class="{ active: viewMode === 'grouped' }" @click="viewMode = 'grouped'" title="按天">
            <CalendarDays :size="16" />
          </button>
          <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格">
            <LayoutGrid :size="16" />
          </button>
          <button :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'" title="按来源">
            <Globe :size="16" />
          </button>
        </div>
        <div class="view-toggle">
          <button
            :class="{ active: compactMode }"
            @click="toggleCompact"
            title="紧凑模式"
          >
            <AlignVerticalJustifyStart :size="16" />
          </button>
        </div>
      </div>
    </div>

    <div class="list-wrapper">
      <p v-if="error" class="error">{{ error }}</p>

      <section class="list" :class="{ 'list-grid': viewMode === 'grid' }">
        <template v-if="viewMode === 'flat' || viewMode === 'grid'">
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

        <template v-else-if="viewMode === 'grouped'">
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

        <template v-else-if="viewMode === 'source'">
          <template v-for="group in sourceGroupedItems" :key="group.label">
            <div class="source-header" :class="{ 'source-section': group.items.length === 0 && !group.children }">
              <span class="source-label">{{ group.label }}</span>
              <span class="source-count">{{ group.count }} 条</span>
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

            <template v-if="group.children">
              <template v-for="child in group.children" :key="child.label">
                <div class="source-subheader">
                  <span class="source-sublabel">{{ child.label }}</span>
                  <span class="source-subcount">{{ child.items.length }} 条</span>
                </div>
                <article
                  v-for="item in child.items"
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
