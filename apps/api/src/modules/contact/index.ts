import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppEnv } from '../../types/hono.ts';
import { rateLimitMiddleware } from '../../middleware/rateLimit.ts';
import { config } from '../../config/index.ts';
import { getTransporter } from '../../utils/notify/index.ts';
import { error, success } from '../../utils/response/index.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('contact');

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

const contact = new Hono<AppEnv>();

contact.use(
  '*',
  rateLimitMiddleware({
    windowMs: 15 * 60_000,
    maxRequests: 3,
    keyPrefix: 'contact',
  }),
);

contact.post('/', zValidator('json', contactSchema), async (c) => {
  const data = c.req.valid('json');

  logger.info(
    { subject: data.subject },
    'Contact form submission',
  );

  if (config.APP_ENV === 'test') {
    logger.info('Email skipped (test environment)');
    return success(c, { message: 'Thank you for your message. We will get back to you soon.' });
  }

  try {
    await getTransporter().sendMail({
      from: config.EMAIL_FROM,
      to: config.ADMIN_EMAIL,
      subject: `[BrewForm Contact] ${data.subject}`,
      text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
    });

    return success(c, { message: 'Thank you for your message. We will get back to you soon.' });
  } catch (err) {
    logger.error({ err }, 'Failed to send contact email');
    return error(c, 'INTERNAL_ERROR', 'Failed to send message. Please try again later.', 500);
  }
});

export default contact;
