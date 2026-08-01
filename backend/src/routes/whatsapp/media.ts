import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
]);

const safeFilename = (filename: string) => {
  const normalized = filename
    .replace(/[\r\n"\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '_')
    .trim();
  return normalized || 'media';
};

const serializeMedia = (media: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  publicToken: string;
  createdAt: Date;
}) => ({
  id: media.id,
  filename: media.filename,
  mimeType: media.mimeType,
  sizeBytes: media.sizeBytes,
  publicUrl: `${config.publicApiUrl ?? ''}/public/whatsapp/media/${media.publicToken}`,
  createdAt: media.createdAt.toISOString(),
});

export async function whatsappMediaRoutes(app: FastifyInstance) {
  app.post('/media', async (request, reply) => {
    const maxBytes = config.whatsappUploadMaxMb * 1024 * 1024;
    let part;
    try {
      part = await request.file({ limits: { files: 1, fileSize: maxBytes + 1 } });
    } catch {
      return reply.code(400).send({ error: 'Invalid multipart upload.' });
    }
    if (!part) return reply.code(400).send({ error: 'A media file is required.' });

    const chunks: Buffer[] = [];
    let sizeBytes = 0;
    for await (const chunk of part.file) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) {
        part.file.resume();
        return reply.code(413).send({ error: 'Media file is too large.' });
      }
      chunks.push(Buffer.from(chunk));
    }

    if (!ALLOWED_MIME_TYPES.has(part.mimetype)) {
      return reply.code(415).send({ error: 'Unsupported media type.' });
    }
    if (sizeBytes === 0) return reply.code(400).send({ error: 'Media file is empty.' });

    const media = await prisma.whatsAppMedia.create({
      data: {
        tenantId: getTenantId(),
        uploadedById: request.user.sub,
        filename: safeFilename(part.filename),
        mimeType: part.mimetype,
        sizeBytes,
        bytes: Buffer.concat(chunks, sizeBytes),
        publicToken: randomBytes(32).toString('base64url'),
      },
    });

    return reply.code(201).send({ media: serializeMedia(media) });
  });

}

export async function publicWhatsAppMediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/public/whatsapp/media/:token', async (request, reply) => {
    const media = await prisma.whatsAppMedia.findUnique({
      where: { publicToken: request.params.token },
      select: { filename: true, mimeType: true, sizeBytes: true, bytes: true },
    });
    if (!media) return reply.code(404).send({ error: 'Media not found.' });

    return reply
      .type(media.mimeType)
      .header('content-length', String(media.sizeBytes))
      .header('content-disposition', `inline; filename="${safeFilename(media.filename)}"`)
      .send(Buffer.from(media.bytes));
  });
}
