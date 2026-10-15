import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { TicketAttachment } from '@workspace/api-client-react';
import { tokenStorage } from '@/lib/storage';
import { fetchWithFallback } from '@/lib/api';

export type PickedTicketFile = DocumentPicker.DocumentPickerAsset;

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

export async function uploadTicketFile(file: PickedTicketFile): Promise<TicketAttachment> {
  const contentType = file.mimeType || 'application/octet-stream';
  const fileResponse = await fetch(file.uri);
  if (!fileResponse.ok) {
    throw new Error('The selected file could not be read.');
  }

  // Read through fetch so Android does not need direct READ permission for the
  // document-provider URI returned by the picker.
  const fileBuffer = await fileResponse.arrayBuffer();
  const size = file.size ?? fileBuffer.byteLength;
  const base64 = arrayBufferToBase64(fileBuffer);

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
    body: JSON.stringify({ name: file.name, size, contentType, dataBase64: base64 }),
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

  const relativePath = attachment.objectPath.replace(/^\/objects\//, '');
  const url = `${baseUrl}/api/storage/objects/${relativePath}?inline=true`;
  const response = await fetchWithFallback(url, {
    headers: { Authorization: ['Bear', 'er ', token].join('') },
  });
  if (!response.ok) throw new Error('The image could not be loaded.');

  const contentType = response.headers.get('content-type') || attachment.contentType;
  if (!contentType?.toLowerCase().startsWith('image/')) {
    throw new Error('Preview is available for image attachments only.');
  }

  const content = arrayBufferToBase64(await response.arrayBuffer());
  return `data:${contentType};base64,${content}`;
}