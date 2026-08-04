import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import type {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  TicketAttachment,
} from '@workspace/api-client-react';

type RequestUpload = (variables: {
  data: RequestUploadUrlBody;
}) => Promise<RequestUploadUrlResponse>;

export async function pickAndUploadAttachment(
  requestUpload: RequestUpload,
): Promise<TicketAttachment | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const size = asset.size ?? new File(asset.uri).size;
  const contentType = asset.mimeType || 'application/octet-stream';
  const upload = await requestUpload({
    data: {
      name: asset.name,
      size,
      contentType,
    },
  });

  const response = await fetch(upload.uploadURL, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: new File(asset.uri),
  });

  if (!response.ok) {
    throw new Error('Failed to upload file to storage');
  }

  return {
    name: upload.metadata.name,
    size: upload.metadata.size,
    contentType: upload.metadata.contentType,
    objectPath: upload.objectPath,
    uploadedAt: new Date().toISOString(),
  };
}