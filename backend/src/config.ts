export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'change_me',
  engagementWebhookUrl: process.env.ENGAGEMENT_WEBHOOK_URL?.trim() || null,
  engagementWebhookTimeoutMs: Number(process.env.ENGAGEMENT_WEBHOOK_TIMEOUT_MS ?? 5000),
  // Static bearer token for server-to-server automation (n8n crons).
  // When unset, the /automation/* routes only accept a coordinator JWT.
  automationToken: process.env.AUTOMATION_API_TOKEN?.trim() || null,
  // Public URL of the frontend (e.g. https://rede.guti.com.br/) used to build
  // absolute links (event confirmation) inside automation payloads.
  appPublicUrl: process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '') || null,
};
