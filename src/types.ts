export interface ParsedItem {
  type: 'github-repo' | 'url';
  title: string;
  url: string;
  host: string;
  owner: string | null;
  repo: string | null;
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
