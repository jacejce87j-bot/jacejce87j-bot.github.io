import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { requestUploadUrl, type TicketAttachment } from '@workspace/api-client-react';

export type PickedTicketFile = DocumentPicker.DocumentPickerAsset;

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

  const blob = await fileResponse.blob();
  const size = file.size ?? blob.size;
  const upload = await requestUploadUrl({
    name: file.name,
    size,
    contentType,
  });

  const uploadResponse = await fetch(upload.uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error('The file could not be uploaded.');
  }

  return {
    name: upload.metadata.name,
    size: upload.metadata.size,
    contentType: upload.metadata.contentType,
    objectPath: upload.objectPath,
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