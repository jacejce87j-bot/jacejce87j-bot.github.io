import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { File as ExpoFile, UploadTask, UploadType } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { TicketAttachment } from '@workspace/api-client-react';
import { tokenStorage } from '@/lib/storage';
import { BACKUP_API, fetchWithFallback, PRIMARY_API } from '@/lib/api';

export type PickedTicketFile = DocumentPicker.DocumentPickerAsset;
export type TicketUploadProgress = {
  stage: 'preparing' | 'uploading';
  progress: number | null;
};

const PREVIEW_TARGET_BYTES = 300 * 1024;
const PREVIEW_MAX_BYTES = 512 * 1024;
const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function createTicketUploadId() {
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function authHeader(token: string) {
  return ['Bear', 'er ', token].join('');
}

function getFileContentType(file: PickedTicketFile) {
  if (file.mimeType) return file.mimeType;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export async function pickTicketFiles(): Promise<PickedTicketFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: true,
  });

  return result.canceled ? [] : result.assets;
}

function base64ByteLength(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function createImagePreview(uri: string) {
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
  const attempts = [
    { maxDimension: 1280, quality: 0.62 },
    { maxDimension: 1280, quality: 0.45 },
    { maxDimension: 960, quality: 0.38 },
    { maxDimension: 640, quality: 0.32 },
    { maxDimension: 480, quality: 0.28 },
  ];

  for (const attempt of attempts) {
    const resize = dimensions.width >= dimensions.height
      ? { width: Math.min(dimensions.width, attempt.maxDimension) }
      : { height: Math.min(dimensions.height, attempt.maxDimension) };
    const result = await manipulateAsync(
      uri,
      [{ resize }],
      { base64: true, compress: attempt.quality, format: SaveFormat.JPEG },
    );
    if (!result.base64) throw new Error('The image preview could not be generated.');
    const size = base64ByteLength(result.base64);
    if (size <= PREVIEW_TARGET_BYTES) return { base64: result.base64, size };
    if (size <= PREVIEW_MAX_BYTES && attempt.maxDimension === 480) return { base64: result.base64, size };
  }

  throw new Error('The image preview could not be reduced below 512 KB.');
}

async function getExistingImageUpload(uploadId: string, token: string): Promise<TicketAttachment | null> {
  const response = await fetchWithFallback(`/api/storage/uploads/image-pair/${encodeURIComponent(uploadId)}`, {
    headers: { Authorization: authHeader(token) },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Unable to check upload status (HTTP ${response.status}).`);
  }
  return response.json();
}

function parseUploadedAttachment(body: string, status: number): TicketAttachment {
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`The upload service returned an invalid response (HTTP ${status}).`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(payload.error || `The upload failed (HTTP ${status}).`);
  }
  if (!payload.objectPath || !payload.previewObjectPath) {
    throw new Error('The upload service did not return both the original and preview image.');
  }
  return payload as TicketAttachment;
}

async function uploadImagePair(
  file: PickedTicketFile,
  uploadId: string,
  onProgress?: (progress: number) => void,
): Promise<TicketAttachment> {
  const token =
    (globalThis as any).__AUTH_TOKEN__ ??
    ((typeof window !== 'undefined' && typeof window.localStorage !== 'undefined')
      ? window.localStorage.getItem('userToken') ?? window.localStorage.getItem('auth_token') ?? window.localStorage.getItem('token')
      : null) ??
    (await tokenStorage.getItem('userToken'));
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const existingUpload = await getExistingImageUpload(uploadId, token);
  if (existingUpload) return existingUpload;

  const contentType = getFileContentType(file);
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Only image attachments can use the image preview pipeline.');
  }

  const originalFile = new ExpoFile(file.uri);
  const originalSize = file.size ?? originalFile.size;
  if (!Number.isSafeInteger(originalSize) || originalSize <= 0) {
    throw new Error('The selected image has an invalid file size.');
  }
  if (originalSize > 15 * 1024 * 1024) {
    throw new Error('The original image exceeds the 15 MB upload limit.');
  }

  const preview = await createImagePreview(file.uri);
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    const originalResponse = await fetch(file.uri);
    if (!originalResponse.ok) throw new Error('The selected image could not be read.');
    const originalBuffer = await originalResponse.arrayBuffer();
    const formData = new FormData();
    formData.append('original', new Blob([originalBuffer], { type: contentType }), file.name);
    formData.append('uploadId', uploadId);
    formData.append('originalName', file.name);
    formData.append('originalSize', String(originalSize));
    formData.append('contentType', contentType);
    formData.append('previewDataBase64', preview.base64);
    formData.append('previewSize', String(preview.size));
    const response = await fetchWithFallback('/api/storage/uploads/image-pair', {
      method: 'POST',
      headers: {
        Authorization: authHeader(token),
      },
      body: formData,
    });
    const body = await response.text();
    return parseUploadedAttachment(body, response.status);
  }

  const previewBase64 = preview.base64;
  let lastError: Error | null = null;
  for (const baseUrl of [PRIMARY_API, BACKUP_API]) {
    const task = new UploadTask(originalFile, `${baseUrl.replace(/\/+$/, '')}/api/storage/uploads/image-pair`, {
      uploadType: UploadType.MULTIPART,
      fieldName: 'original',
      mimeType: contentType,
      sessionType: 'foreground',
      headers: { Authorization: authHeader(token) },
      parameters: {
        uploadId,
        originalName: file.name,
        originalSize: String(originalSize),
        contentType,
        previewDataBase64: previewBase64,
        previewSize: String(preview.size),
      },
      onProgress: (progress) => {
        if (progress.totalBytes > 0) onProgress?.(Math.min(100, Math.round((progress.bytesSent / progress.totalBytes) * 100)));
      },
    });

    let result;
    try {
      result = await task.uploadAsync();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('The image upload failed.');
      if (baseUrl === BACKUP_API) throw lastError;
      continue;
    } finally {
      task.release();
    }
    if (result.status >= 500) {
      lastError = new Error(`The upload service returned HTTP ${result.status}.`);
      if (baseUrl === BACKUP_API) throw lastError;
      continue;
    }
    return parseUploadedAttachment(result.body, result.status);
  }

  throw lastError ?? new Error('The image upload failed on all configured API endpoints.');
}

export async function uploadTicketFile(
  file: PickedTicketFile,
  uploadId = createTicketUploadId(),
  onProgress?: (progress: TicketUploadProgress) => void,
): Promise<TicketAttachment> {
  const contentType = getFileContentType(file);
  if (contentType.toLowerCase().startsWith('image/') && contentType.toLowerCase() !== 'image/svg+xml') {
    onProgress?.({ stage: 'preparing', progress: null });
    return uploadImagePair(file, uploadId, (progress) => onProgress?.({ stage: 'uploading', progress }));
  }

  const fileResponse = await fetch(file.uri);
  if (!fileResponse.ok) {
    throw new Error('The selected file could not be read.');
  }

  // Read through fetch so Android does not need direct READ permission for the
  // document-provider URI returned by the picker.
  const fileBuffer = await fileResponse.arrayBuffer();
  const size = file.size ?? fileBuffer.byteLength;
  const base64 = arrayBufferToBase64(fileBuffer);
  return uploadTicketData(file.name, contentType, base64, size);
}

export async function uploadTicketData(
  name: string,
  contentType: string,
  dataBase64: string,
  size: number,
): Promise<TicketAttachment> {
  const token =
    (globalThis as any).__AUTH_TOKEN__ ??
    ((typeof window !== 'undefined' && typeof window.localStorage !== 'undefined')
      ? window.localStorage.getItem('userToken') ?? window.localStorage.getItem('auth_token') ?? window.localStorage.getItem('token')
      : null) ??
    (await tokenStorage.getItem('userToken'));

  const resp = await fetchWithFallback('/api/storage/uploads/direct', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name, size, contentType, dataBase64 }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    let err: any = {};
    try { err = JSON.parse(errText); } catch {}
    throw new Error(err.error || 'The file could not be uploaded.');
  }

  const json = await resp.json();
  return {
    name: json.metadata.name,
    size: json.metadata.size,
    contentType: json.metadata.contentType,
    objectPath: json.objectPath,
    uploadedAt: new Date().toISOString(),
  };
}

export async function loadTicketSvgPreview(
  attachment: TicketAttachment,
  getToken: () => Promise<string | null>,
  baseUrl: string,
): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const relativePath = attachment.objectPath.replace(/^\/objects\//, '');
  const url = `${baseUrl}/api/storage/objects/${relativePath}?inline=true`;
  const response = await fetchWithFallback(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('The signature could not be loaded.');

  const contentType = response.headers.get('content-type') || attachment.contentType;
  if (contentType?.toLowerCase() !== 'image/svg+xml') {
    throw new Error('This attachment is not an SVG image.');
  }

  return response.text();
}

export function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export async function openTicketAttachment(
  attachment: TicketAttachment,
  getToken: () => Promise<string | null>,
  baseUrl: string,
) {
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const relativePath = attachment.objectPath.replace(/^\/objects\//, '');
  const url = `${baseUrl}/api/storage/objects/${relativePath}`;

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    const response = await fetchWithFallback(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('The attachment could not be downloaded.');
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    return;
  }

  if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable.');
  const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const target = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
  const response = await fetchWithFallback(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('The attachment could not be downloaded.');
  const content = arrayBufferToBase64(await response.arrayBuffer());
  await FileSystem.writeAsStringAsync(target, content, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(target, {
      mimeType: attachment.contentType,
      dialogTitle: attachment.name,
    });
  } else {
    throw new Error('No app is available to open this attachment.');
  }
}

export async function loadTicketAttachmentPreview(
  attachment: TicketAttachment,
  getToken: () => Promise<string | null>,
  baseUrl: string,
): Promise<string> {
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const imagePath = attachment.previewObjectPath ?? attachment.objectPath;
  const relativePath = imagePath.replace(/^\/objects\//, '');
  const url = `${baseUrl}/api/storage/objects/${relativePath}?inline=true`;
  const response = await fetchWithFallback(url, {
    headers: { Authorization: ['Bear', 'er ', token].join('') },
  });
  if (!response.ok) throw new Error('The image could not be loaded.');

  const contentType = response.headers.get('content-type') || (attachment.previewObjectPath ? 'image/jpeg' : attachment.contentType);
  if (!contentType?.toLowerCase().startsWith('image/')) {
    throw new Error('Preview is available for image attachments only.');
  }

  const content = arrayBufferToBase64(await response.arrayBuffer());
  return `data:${contentType};base64,${content}`;
}