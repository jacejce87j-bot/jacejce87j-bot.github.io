import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';

import { pool } from '@workspace/db';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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
    res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(row.size ?? Buffer.byteLength(row.data)));
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
    res.status(200).send(row.data);
  } catch (error) {
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
