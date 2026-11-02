import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import multer from 'multer';

import { pool } from '@workspace/db';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const imagePairUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 8, fieldSize: 768 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype.toLowerCase().startsWith('image/')),
}).single('original');
const MAX_PREVIEW_BYTES = 512 * 1024;
const UPLOAD_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;

function hasAuthenticatedSession(req: Request): boolean {
  return req.isAuthenticated?.() ?? false;
}

function shouldFallBackToDb(err: unknown): boolean {
  if (err instanceof ObjectNotFoundError) {
    return true;
  }

  if (err instanceof Error) {
    const message = err.message || '';
    return (
      message.includes('PRIVATE_OBJECT_DIR not set') ||
      message.includes('PUBLIC_OBJECT_SEARCH_PATHS not set') ||
      message.includes('Create a bucket in \'Object Storage\' tool')
    );
  }

  return false;
}

// Helper to return 413 when file is too large
function fileTooLarge(size: number) {
  return size > 15 * 1024 * 1024; // 15 MB limit
}

function decodeBase64(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const buffer = Buffer.from(value, 'base64');
  return buffer.toString('base64') === value ? buffer : null;
}

function serializeImageUpload(row: {
  id: string;
  preview_id: string | null;
  filename: string;
  content_type: string | null;
  size: number | null;
  created_at: Date | string;
}) {
  return {
    name: row.filename,
    size: row.size ?? 0,
    contentType: row.content_type ?? 'application/octet-stream',
    objectPath: `/objects/${row.id}`,
    ...(row.preview_id ? { previewObjectPath: `/objects/${row.preview_id}` } : {}),
    uploadedAt: new Date(row.created_at).toISOString(),
  };
}

router.get('/storage/uploads/image-pair/:uploadId', async (req: Request, res: Response) => {
  if (!hasAuthenticatedSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const uploadId = req.params.uploadId;
  if (typeof uploadId !== 'string' || !UPLOAD_ID_PATTERN.test(uploadId)) {
    res.status(400).json({ error: 'Invalid upload ID' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT original.id, original.preview_id, original.filename, original.content_type, original.size, original.created_at
       FROM attachments original
       WHERE original.upload_key = $1`,
      [uploadId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'No completed upload exists for this ID' });
      return;
    }

    res.json(serializeImageUpload(result.rows[0]));
  } catch (error) {
    req.log.error({ err: error }, 'Error looking up idempotent image upload');
    res.status(500).json({ error: 'Failed to look up image upload' });
  }
});

router.post('/storage/uploads/image-pair', (req: Request, res: Response, next) => {
  if (!hasAuthenticatedSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.is('multipart/form-data')) {
    imagePairUpload(req, res, (error) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Original image is too large' });
        return;
      }
      if (error) {
        req.log.warn({ err: error }, 'Invalid image upload request');
        res.status(400).json({ error: 'Invalid image upload request' });
        return;
      }
      next();
    });
    return;
  }
  res.status(415).json({ error: 'Use multipart form data to upload an image' });
}, async (req: Request, res: Response) => {
  const body = req.body as {
    uploadId?: unknown;
    originalName?: unknown;
    originalSize?: unknown;
    contentType?: unknown;
    previewDataBase64?: unknown;
    previewSize?: unknown;
  };
  const original = req.file?.buffer;
  const preview = decodeBase64(body?.previewDataBase64);
  const uploadId = body?.uploadId;
  const originalName = body?.originalName;
  const originalSize = Number(body?.originalSize);
  const contentType = String(body?.contentType ?? req.file?.mimetype ?? '').toLowerCase();
  const previewSize = Number(body?.previewSize);

  if (
    typeof uploadId !== 'string' ||
    !UPLOAD_ID_PATTERN.test(uploadId) ||
    typeof originalName !== 'string' ||
    !originalName.trim() ||
    !Number.isSafeInteger(originalSize) ||
    typeof body?.previewSize === 'undefined' ||
    !Number.isSafeInteger(previewSize) ||
    !original ||
    !preview ||
    !contentType.startsWith('image/') ||
    (req.file && req.file.mimetype.toLowerCase() !== contentType) ||
    original.length !== originalSize ||
    preview.length !== previewSize ||
    preview.length > MAX_PREVIEW_BYTES
  ) {
    res.status(400).json({ error: 'Image upload metadata or file contents are invalid' });
    return;
  }
  if (fileTooLarge(original.length)) {
    res.status(413).json({ error: 'Original image is too large' });
    return;
  }
  if (!preview.length) {
    res.status(400).json({ error: 'Image preview is empty' });
    return;
  }

  const uploadedBy = req.user?.id ?? null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const originalInsert = await client.query(
      `INSERT INTO attachments (filename, content_type, size, uploaded_by, data, upload_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (upload_key) WHERE upload_key IS NOT NULL DO NOTHING
       RETURNING id, preview_id, filename, content_type, size, created_at`,
      [originalName, contentType, originalSize, uploadedBy, original, uploadId],
    );

    let originalRow = originalInsert.rows[0];
    if (!originalRow) {
      const existing = await client.query(
        `SELECT id, preview_id, filename, content_type, size, created_at
         FROM attachments
         WHERE upload_key = $1
         FOR UPDATE`,
        [uploadId],
      );
      originalRow = existing.rows[0];
      if (
        !originalRow ||
        originalRow.filename !== originalName ||
        originalRow.content_type !== contentType ||
        Number(originalRow.size) !== originalSize ||
        !originalRow.preview_id
      ) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Upload ID was already used for a different or incomplete image' });
        return;
      }
      await client.query('COMMIT');
      res.json(serializeImageUpload(originalRow));
      return;
    }

    const previewInsert = await client.query(
      `INSERT INTO attachments (filename, content_type, size, uploaded_by, data)
       VALUES ($1, 'image/jpeg', $2, $3, $4)
       RETURNING id`,
      [`${originalName}.preview.jpg`, preview.length, uploadedBy, preview],
    );
    originalRow.preview_id = previewInsert.rows[0].id;
    await client.query('UPDATE attachments SET preview_id = $1 WHERE id = $2', [originalRow.preview_id, originalRow.id]);
    await client.query('COMMIT');
    res.json(serializeImageUpload(originalRow));
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      req.log.error({ err: rollbackError }, 'Failed to roll back image upload transaction');
    });
    req.log.error({ err: error }, 'Error storing original image and preview');
    res.status(500).json({ error: 'Failed to store image and preview' });
  } finally {
    client.release();
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
// New direct upload endpoint: POST /storage/uploads/direct
// Accepts JSON: { name, size, contentType, dataBase64 }
// Stores bytes in attachments table and returns { id, objectPath, metadata }
router.post('/storage/uploads/direct', async (req: Request, res: Response) => {
  if (!hasAuthenticatedSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as { name?: string; size?: number; contentType?: string; dataBase64?: string };
  if (!body || !body.name || !body.dataBase64 || typeof body.size !== 'number') {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  if (fileTooLarge(body.size)) {
    res.status(413).json({ error: 'File too large' });
    return;
  }

  try {
    const buffer = Buffer.from(body.dataBase64, 'base64');
    // Ensure buffer length matches reported size
    if (buffer.length !== body.size && Math.abs(buffer.length - body.size) > 2) {
      // allow small discrepancies
      req.log.warn({ expected: body.size, actual: buffer.length }, 'Uploaded size mismatch');
    }

    const uploadedBy = req.user?.id ?? null;
    const insertResult = await pool.query(
      'INSERT INTO attachments (filename, content_type, size, uploaded_by, data) VALUES ($1, $2, $3, $4, $5) RETURNING id, filename, content_type, size, created_at',
      [body.name, body.contentType ?? null, body.size, uploadedBy, buffer],
    );

    const row = insertResult.rows[0];
    const objectPath = `/objects/${row.id}`;

    res.json({ id: row.id, objectPath, metadata: { name: row.filename, size: row.size, contentType: row.content_type } });
  } catch (error) {
    req.log.error({ err: error }, 'Error storing attachment in DB');
    res.status(500).json({ error: 'Failed to store attachment' });
  }
});

// Existing presign endpoint remains below for backward compatibility
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
  if (!hasAuthenticatedSession(req)) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  if (!hasAuthenticatedSession(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // First attempt: object storage (external). If not configured or the object is missing,
    // fall back cleanly to the database-backed attachment blob.
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const contentType = response.headers.get('content-type') ?? '';
      if (req.query.inline === 'true' && contentType.toLowerCase().startsWith('image/')) {
        res.setHeader('Content-Disposition', 'inline');
      }

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
      return;
    } catch (err) {
      if (!shouldFallBackToDb(err)) {
        throw err;
      }
      // otherwise fall through to DB fallback
    }

    // DB fallback: read attachment bytes from attachments table
    const id = wildcardPath;
    const result = await pool.query('SELECT filename, content_type, size, data FROM attachments WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      req.log.warn({ id }, 'Attachment not found in DB');
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const row = result.rows[0];
    const contentType = row.content_type || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(row.size ?? Buffer.byteLength(row.data)));
    const inlineImage = req.query.inline === 'true' && contentType.toLowerCase().startsWith('image/');
    res.setHeader('Content-Disposition', inlineImage ? 'inline' : `attachment; filename="${row.filename}"`);
    res.status(200).send(row.data);
  } catch (error) {
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
