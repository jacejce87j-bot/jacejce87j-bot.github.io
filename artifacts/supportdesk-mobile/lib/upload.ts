import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
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
  const nativeFile = Platform.OS === 'web' ? null : new File(asset.uri);
  const size = asset.size ?? nativeFile?.size ?? asset.file?.size;
  if (size == null) {
    throw new Error('Could not determine the selected file size');
  }
  const contentType = asset.mimeType || 'application/octet-stream';
  const upload = await requestUpload({
    data: {
      name: asset.name,
      size,
      contentType,
    },
  });

  // DocumentPicker exposes a browser File on web. Keep that object for the
  // upload; Expo's filesystem File class is for native URIs and does not
  // reliably carry the selected browser file's bytes through fetch.
  const body = Platform.OS === 'web' && asset.file ? asset.file : nativeFile;
  if (!body) {
    throw new Error('Could not read the selected file');
  }
  const response = await fetch(upload.uploadURL, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body,
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