export interface ParsedItem {
  type: 'github-repo' | 'url';
  title: string;
  url: string;
  host: string;
  owner: string | null;
  repo: string | null;
}

export interface AppVariables {
  userId: number;
  user: { id: number; is_admin: number };
}

export interface DbItem {
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

export interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export interface DbApiToken {
  id: number;
  user_id: number;
  token: string;
  name: string;
  created_at: string;
}

export interface SaveItemResult {
  created: boolean;
  item: DbItem;
}

export interface ListItemsOptions {
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
  q?: string;
}

export interface ListItemsResult {
  items: DbItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatsResult {
  total: number;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
}
