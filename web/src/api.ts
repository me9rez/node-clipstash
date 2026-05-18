const API_BASE = '/api';

import { getToken } from './auth.js';

export interface Stats {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export interface Item {
  id: number;
  type: 'github-repo' | 'url';
  title: string | null;
  url: string;
  host: string | null;
  owner: string | null;
  repo: string | null;
  status: 'unread' | 'read' | 'archived';
  tags: string | null;
  note: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_count: number;
}

export interface ItemsResult {
  items: Item[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserInfo {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface UserListItem {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface TokenItem {
  id: number;
  token: string;
  name: string;
  created_at: string;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export async function login(username: string, password: string): Promise<{ token: string; user: UserInfo }> {
  return request<{ token: string; user: UserInfo }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchMe(): Promise<UserInfo> {
  return request<UserInfo>('/auth/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function fetchStats(): Promise<Stats> {
  return request<Stats>('/stats');
}

export interface FetchItemsParams {
  q?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function fetchItems(params: FetchItemsParams = {}): Promise<ItemsResult> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  return request<ItemsResult>(`/items?${searchParams.toString()}`);
}

export async function updateItem(id: number, patch: Partial<Pick<Item, 'title' | 'status' | 'tags' | 'note'>>): Promise<Item> {
  return request<Item>(`/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteItem(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/items/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchUsers(): Promise<UserListItem[]> {
  return request<UserListItem[]>('/users');
}

export async function createUser(username: string, password: string): Promise<UserListItem> {
  return request<UserListItem>('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function deleteUser(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/users/${id}`, {
    method: 'DELETE',
  });
}

export async function changeUserPassword(id: number, password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}

export async function fetchTokens(): Promise<TokenItem[]> {
  return request<TokenItem[]>('/tokens');
}

export async function createToken(name: string): Promise<TokenItem> {
  return request<TokenItem>('/tokens', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteToken(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/tokens/${id}`, {
    method: 'DELETE',
  });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    throw new Error((data?.error as string) || `Request failed: ${res.status}`);
  }

  return data as T;
}
