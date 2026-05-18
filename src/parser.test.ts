import { describe, it, expect } from 'vitest';
import { parseClipboardText } from './parser.js';

describe('parseClipboardText', () => {
  it('should return null for empty input', () => {
    expect(parseClipboardText('')).toBeNull();
    expect(parseClipboardText('   ')).toBeNull();
  });

  it('should return null for non-URL text', () => {
    expect(parseClipboardText('hello world')).toBeNull();
  });

  it('should parse a simple HTTP URL', () => {
    const result = parseClipboardText('https://example.com/blog/post');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('url');
    expect(result!.url).toBe('https://example.com/blog/post');
    expect(result!.host).toBe('example.com');
    expect(result!.title).toBe('post');
  });

  it('should parse a GitHub repo URL', () => {
    const result = parseClipboardText('https://github.com/vuejs/core');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('github-repo');
    expect(result!.url).toBe('https://github.com/vuejs/core');
    expect(result!.host).toBe('github.com');
    expect(result!.owner).toBe('vuejs');
    expect(result!.repo).toBe('core');
    expect(result!.title).toBe('vuejs/core');
  });

  it('should parse GitHub repo URL with .git suffix', () => {
    const result = parseClipboardText('https://github.com/foo/bar.git');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('github-repo');
    expect(result!.url).toBe('https://github.com/foo/bar');
    expect(result!.repo).toBe('bar');
  });

  it('should parse GitHub SSH URL', () => {
    const result = parseClipboardText('git@github.com:owner/repo.git');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('github-repo');
    expect(result!.url).toBe('https://github.com/owner/repo');
    expect(result!.owner).toBe('owner');
    expect(result!.repo).toBe('repo');
  });

  it('should classify GitHub non-repo pages as generic URL', () => {
    const r1 = parseClipboardText('https://github.com/explore');
    expect(r1).not.toBeNull();
    expect(r1!.type).toBe('url');

    const r2 = parseClipboardText('https://github.com/features');
    expect(r2).not.toBeNull();
    expect(r2!.type).toBe('url');
  });

  it('should extract URL from text with surrounding content', () => {
    const result = parseClipboardText('Check out https://example.com/page xyz');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/page');
  });

  it('should handle URLs with query params', () => {
    const result = parseClipboardText('https://example.com/search?q=test&p=1');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/search?q=test&p=1');
  });

  it('should strip hash fragments', () => {
    const result = parseClipboardText('https://example.com/page#section');
    expect(result).not.toBeNull();
    expect(result!.url).toBe('https://example.com/page');
  });

  it('should generate title from URL path', () => {
    const result = parseClipboardText('https://example.com/hello-world_test');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('hello world test');
  });
});
