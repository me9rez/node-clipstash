import { ref, computed } from 'vue';
import { getToken, setToken, clearAuth, setUser, getUser } from './auth.js';
import { login as loginApi, fetchMe } from './api.js';
import type { UserInfo } from './api';

const currentUser = ref<UserInfo | null>(getUser() as UserInfo | null);
const authChecking = ref(false);

export const isAuthenticated = computed(() => !!currentUser.value && !!getToken());

let checked = false;

export function useAuth() {
  async function checkAuth(): Promise<boolean> {
    if (checked) return isAuthenticated.value;

    const token = getToken();

    if (!token) {
      authChecking.value = false;
      checked = true;
      return false;
    }

    authChecking.value = true;

    try {
      currentUser.value = await fetchMe();
      checked = true;
      return true;
    } catch {
      clearAuth();
      currentUser.value = null;
      checked = true;
      return false;
    } finally {
      authChecking.value = false;
    }
  }

  async function login(username: string, password: string) {
    const result = await loginApi(username, password);

    setToken(result.token);
    setUser(result.user);
    currentUser.value = result.user;

    return result.user;
  }

  function logout() {
    clearAuth();
    currentUser.value = null;
  }

  return { currentUser, isAuthenticated, authChecking, checkAuth, login, logout };
}
