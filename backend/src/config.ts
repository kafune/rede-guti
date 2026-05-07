export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'change_me',
  engagementWebhookUrl: process.env.ENGAGEMENT_WEBHOOK_URL?.trim() || null,
  engagementWebhookTimeoutMs: Number(process.env.ENGAGEMENT_WEBHOOK_TIMEOUT_MS ?? 5000),
};
