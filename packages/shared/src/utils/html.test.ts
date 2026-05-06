import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { escapeHtml } from './html.ts';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('Coffee & Tea')).toBe('Coffee &amp; Tea');
  });

  it('should escape less-than and greater-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"Hello"')).toBe('&quot;Hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's good")).toBe('It&#39;s good');
  });

  it('should escape forward slashes', () => {
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('should escape all special characters combined', () => {
    expect(escapeHtml('"Coffee & Tea\'s <best>/"')).toBe(
      '&quot;Coffee &amp; Tea&#39;s &lt;best&gt;&#x2F;&quot;',
    );
  });
});
