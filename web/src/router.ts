import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './useAuth.js';

const routes = [
  {
    path: '/',
    component: () => import('./views/HomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    component: () => import('./views/LoginView.vue'),
  },
  {
    path: '/settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    component: () => import('./views/AdminView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const { isAuthenticated, checkAuth, currentUser } = useAuth();

  await checkAuth();

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return '/login';
  }

  if (to.path === '/login' && isAuthenticated.value) {
    return '/';
  }

  if (to.meta.requiresAdmin && !currentUser.value?.is_admin) {
    return '/';
  }
});

export { router };
