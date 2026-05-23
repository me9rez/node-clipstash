import { describe, expect, it } from 'vitest';
import { getMainDomain, getSubdomainLabel } from './domain.js';

describe('getMainDomain', () => {
  it('returns empty string for null or empty input', () => {
    expect(getMainDomain(null)).toBe('');
    expect(getMainDomain('')).toBe('');
    expect(getMainDomain('   ')).toBe('');
  });

  it('handles simple domains', () => {
    expect(getMainDomain('example.com')).toBe('example.com');
    expect(getMainDomain('EXAMPLE.COM')).toBe('example.com');
  });

  it('strips www and other subdomains', () => {
    expect(getMainDomain('www.example.com')).toBe('example.com');
    expect(getMainDomain('blog.example.com')).toBe('example.com');
    expect(getMainDomain('a.b.example.com')).toBe('example.com');
  });

  it('handles two-part TLDs', () => {
    expect(getMainDomain('example.co.uk')).toBe('example.co.uk');
    expect(getMainDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(getMainDomain('blog.example.com.cn')).toBe('example.com.cn');
    expect(getMainDomain('news.example.co.jp')).toBe('example.co.jp');
    expect(getMainDomain('shop.example.com.au')).toBe('example.com.au');
    expect(getMainDomain('api.example.ac.uk')).toBe('example.ac.uk');
    expect(getMainDomain('mirror.example.org.cn')).toBe('example.org.cn');
  });

  it('strips port numbers', () => {
    expect(getMainDomain('example.com:8080')).toBe('example.com');
    expect(getMainDomain('www.example.com:443')).toBe('example.com');
    expect(getMainDomain('blog.example.co.uk:3000')).toBe('example.co.uk');
  });

  it('returns IPv4 as-is', () => {
    expect(getMainDomain('192.168.1.1')).toBe('192.168.1.1');
    expect(getMainDomain('127.0.0.1:3000')).toBe('127.0.0.1');
  });

  it('returns single-segment host as-is', () => {
    expect(getMainDomain('localhost')).toBe('localhost');
  });
});

describe('getSubdomainLabel', () => {
  it('returns null for main domain itself', () => {
    expect(getSubdomainLabel('example.com')).toBeNull();
    expect(getSubdomainLabel('example.co.uk')).toBeNull();
  });

  it('returns subdomain for simple hosts', () => {
    expect(getSubdomainLabel('www.example.com')).toBe('www');
    expect(getSubdomainLabel('blog.example.com')).toBe('blog');
    expect(getSubdomainLabel('a.b.example.com')).toBe('a.b');
  });

  it('returns subdomain for two-part TLDs', () => {
    expect(getSubdomainLabel('www.example.co.uk')).toBe('www');
    expect(getSubdomainLabel('blog.example.com.cn')).toBe('blog');
  });

  it('returns null for null, empty, IPv4', () => {
    expect(getSubdomainLabel(null)).toBeNull();
    expect(getSubdomainLabel('')).toBeNull();
    expect(getSubdomainLabel('192.168.1.1')).toBeNull();
  });
});
