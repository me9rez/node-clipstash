<script setup lang="ts">
import { useRouter } from 'vue-router';
import AdminPanel from '../AdminPanel.vue';

const router = useRouter();
</script>

<template>
  <main class="page">
    <button class="back-link" @click="router.push('/')">&larr; 返回收藏库</button>
    <AdminPanel />
  </main>
</template>

<style scoped>
.back-link {
  display: inline-block;
  margin: 24px 0 16px;
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.back-link:hover {
  color: var(--color-accent-hover);
}
</style>
