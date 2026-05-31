import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  renderTemplate,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from './email.ts';

describe('renderTemplate', () => {
  it('should substitute placeholders with provided values', () => {
    const result = renderTemplate('<p>Hello {{name}}, welcome to {{app_name}}!</p>', {
      name: 'Alice',
      app_name: 'TestApp',
    });
    expect(result).toContain('Hello Alice');
    expect(result).toContain('welcome to TestApp');
  });

  it('should preserve missing keys as-is (placeholder)', () => {
    const result = renderTemplate('Hello {{name}}, enjoy {{missing}}!', { name: 'Bob' });
    expect(result).toContain('Hello Bob');
    expect(result).toContain('{{missing}}');
  });

  it('should escape HTML in substituted values', () => {
    const result = renderTemplate('Hello {{name}}!', { name: '<script>alert("xss")</script>' });
    expect(result).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert("xss")');
  });

  it('should escape all five HTML special characters', () => {
    const result = renderTemplate('X: {{x}}', { x: '&<>"\'/' });
    expect(result).toContain('&amp;');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&#39;');
    expect(result).toContain('&#x2F;');
  });

  it('should escape common XSS payloads', () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      'javascript:alert(1)',
      '<body onload=alert(1)>',
    ];
    for (const payload of payloads) {
      const result = renderTemplate('{{p}}', { p: payload });
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    }
  });

  it('should support w+ placeholder names (word characters)', () => {
    const result = renderTemplate('{{user_name}} {{first_name123}}', {
      user_name: 'Alice',
      first_name123: 'John',
    });
    expect(result).toBe('Alice John');
  });
});

describe('Auth Email', () => {
  describe('sendWelcomeEmail', () => {
    it('should not throw in test environment', async () => {
      await expect(sendWelcomeEmail('test@example.com', 'testuser')).resolves.toBeUndefined();
    });

    it('should handle XSS payloads in username without throwing', async () => {
      await expect(
        sendWelcomeEmail('test@example.com', '<script>alert(1)</script>'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should not throw in test environment', async () => {
      await expect(
        sendPasswordResetEmail('test@example.com', 'token123', 'testuser'),
      ).resolves.toBeUndefined();
    });

    it('should handle XSS payloads in username without throwing', async () => {
      await expect(
        sendPasswordResetEmail('test@example.com', 'token123', '<img src=x onerror=alert(1)>'),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendVerificationEmail', () => {
    it('should not throw in test environment', async () => {
      await expect(
        sendVerificationEmail('test@example.com', 'token456', 'testuser'),
      ).resolves.toBeUndefined();
    });

    it('should handle XSS payloads in username without throwing', async () => {
      await expect(
        sendVerificationEmail('test@example.com', 'token456', '<script>alert(1)</script>'),
      ).resolves.toBeUndefined();
    });
  });
});
