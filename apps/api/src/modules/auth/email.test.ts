import '../../test-setup.ts';
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  renderTemplate,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from './email.ts';
import { template as welcomeTemplate } from '../../templates/email/generated/welcome.ts';
import { template as resetPasswordTemplate } from '../../templates/email/generated/reset-password.ts';
import { template as verifyEmailTemplate } from '../../templates/email/generated/verify-email.ts';
import { appBaseUrl } from '../../utils/notify/index.ts';
import { escapeHtml } from '@brewform/shared/utils';

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

    it('should escape XSS payloads in username in rendered payload', () => {
      const html = renderTemplate(welcomeTemplate, {
        username: '<script>alert(1)</script>',
        app_name: 'BrewForm',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should not throw in test environment', async () => {
      await expect(
        sendPasswordResetEmail('test@example.com', 'token123', 'testuser'),
      ).resolves.toBeUndefined();
    });

    it('should escape XSS payloads in username in rendered payload', () => {
      const html = renderTemplate(resetPasswordTemplate, {
        username: '<img src=x onerror=alert(1)>',
        reset_url: `${appBaseUrl()}/reset-password?token=token123`,
        app_name: 'BrewForm',
      });
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('should build reset link from appBaseUrl with URL-encoded token', () => {
      const token = 'token+123/456?';
      const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      const escapedResetUrl = escapeHtml(resetUrl);
      const html = renderTemplate(resetPasswordTemplate, {
        username: 'testuser',
        reset_url: resetUrl,
        app_name: 'BrewForm',
      });
      expect(html).toContain(appBaseUrl().replace(/\//g, '&#x2F;'));
      expect(html).toContain('href="' + escapedResetUrl + '"');
      expect(html).toContain(encodeURIComponent(token));
    });
  });

  describe('sendVerificationEmail', () => {
    it('should not throw in test environment', async () => {
      await expect(
        sendVerificationEmail('test@example.com', 'token456', 'testuser'),
      ).resolves.toBeUndefined();
    });

    it('should escape XSS payloads in username in rendered payload', () => {
      const html = renderTemplate(verifyEmailTemplate, {
        username: '<script>alert(1)</script>',
        verify_url: `${appBaseUrl()}/verify-email?token=token456`,
        app_name: 'BrewForm',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should build verify link from appBaseUrl with URL-encoded token', () => {
      const token = 'token+special/value?';
      const verifyUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
      const escapedVerifyUrl = escapeHtml(verifyUrl);
      const html = renderTemplate(verifyEmailTemplate, {
        username: 'testuser',
        verify_url: verifyUrl,
        app_name: 'BrewForm',
      });
      expect(html).toContain(appBaseUrl().replace(/\//g, '&#x2F;'));
      expect(html).toContain('href="' + escapedVerifyUrl + '"');
      expect(html).toContain(encodeURIComponent(token));
    });
  });
});
