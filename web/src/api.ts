const API_BASE = '/api';

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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
