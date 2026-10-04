import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { TicketAttachment } from '@workspace/api-client-react';
import { tokenStorage } from '@/lib/storage';

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

export async function pickTicketFile(): Promise<PickedTicketFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  return result.canceled ? null : result.assets[0] ?? null;
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

  const baseUrl =
    (globalThis as any).__API_BASE_URL__ ||
    (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' && window.localStorage.getItem('api_base_url')) ||
    'http://100.116.75.63:5000';

  const token =
    (globalThis as any).__AUTH_TOKEN__ ??
    ((typeof window !== 'undefined' && typeof window.localStorage !== 'undefined')
      ? window.localStorage.getItem('userToken') ?? window.localStorage.getItem('auth_token') ?? window.localStorage.getItem('token')
      : null) ??
    (await tokenStorage.getItem('userToken'));

  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/storage/uploads/direct`, {
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
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
  const downloaded = await FileSystem.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType: attachment.contentType,
      dialogTitle: attachment.name,
    });
  } else {
    throw new Error('No app is available to open this attachment.');
  }
}