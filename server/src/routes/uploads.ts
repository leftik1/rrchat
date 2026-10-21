import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { PROJECT_ROOT } from '../config.js';

const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface UploadedFileMetadata {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  textContent?: string;
  dataUrl?: string; // for image vision input
}

export const fileMetadataMap = new Map<string, UploadedFileMetadata>();

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.c', '.cpp', '.h', '.hpp',
  '.rs', '.go', '.java', '.cs', '.php', '.rb', '.sh', '.bat', '.ps1',
  '.html', '.css', '.scss', '.xml', '.yaml', '.yml', '.ini', '.toml', '.sql'
]);

export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const id = `upl_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const originalName = data.filename || 'file';
    const ext = path.extname(originalName).toLowerCase();
    const mimeType = data.mimetype || 'application/octet-stream';
    const safeStorageName = `${id}${ext}`;
    const targetPath = path.join(UPLOADS_DIR, safeStorageName);

    const buffer = await data.toBuffer();
    fs.writeFileSync(targetPath, buffer);

    const isImage = mimeType.startsWith('image/');
    let textContent: string | undefined;
    let dataUrl: string | undefined;

    if (isImage) {
      dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    } else if (ext === '.pdf' || mimeType === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        await parser.destroy();
        textContent = parsed.text.trim();
      } catch (err: any) {
        console.warn(`[Uploads] PDF parse failed for ${originalName}:`, err.message);
        textContent = `[Не удалось извлечь текст из PDF: ${err.message}]`;
      }
    } else if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/')) {
      textContent = buffer.toString('utf-8');
    }

    const metadata: UploadedFileMetadata = {
      id,
      filename: originalName,
      mimeType,
      size: buffer.length,
      isImage,
      textContent,
      dataUrl,
    };

    fileMetadataMap.set(id, metadata);

    return metadata;
  });

  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const meta = fileMetadataMap.get(id);

    // Search file in uploads dir
    const files = fs.readdirSync(UPLOADS_DIR);
    const matched = files.find((f) => f.startsWith(id));

    if (!matched) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const filePath = path.join(UPLOADS_DIR, matched);
    const ext = path.extname(matched).toLowerCase();
    const dangerousExts = new Set(['.html', '.htm', '.svg', '.xml', '.xhtml', '.js', '.mjs']);
    const isDangerous = dangerousExts.has(ext);

    reply.header('Content-Security-Policy', 'sandbox');
    reply.header('X-Content-Type-Options', 'nosniff');

    if (isDangerous) {
      reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(matched)}"`);
    } else {
      reply.header('Content-Disposition', 'inline');
    }

    if (meta) {
      reply.type(meta.mimeType);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      reply.type('image/jpeg');
    } else if (ext === '.png') {
      reply.type('image/png');
    } else if (ext === '.webp') {
      reply.type('image/webp');
    } else if (ext === '.pdf') {
      reply.type('application/pdf');
    }

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });
};
