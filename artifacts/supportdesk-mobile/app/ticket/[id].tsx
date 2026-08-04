import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getGetMobileTicketQueryKey,
  getListMobileTicketsQueryKey,
  getListMobileTicketCommentsQueryKey,
  useCreateMobileTicketComment,
  useGetMobileTicket,
  useListMobileTicketComments,
  useRequestUploadUrl,
  useUpdateMobileTicket,
  type TicketAttachment,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { pickAndUploadAttachment } from '@/lib/upload';

const statuses = ['open', 'pending', 'on_hold', 'solved', 'closed'] as const;
const priorities = ['low', 'normal', 'high', 'urgent'] as const;

function label(value: string) {
  return value.replace('_', ' ');
}

export default function TicketDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const ticketId = Number(params.id);
  const ticketQuery = useGetMobileTicket(ticketId);
  const commentsQuery = useListMobileTicketComments(ticketId);
  const updateTicket = useUpdateMobileTicket();
  const createComment = useCreateMobileTicketComment();
  const requestUpload = useRequestUploadUrl();
  const [uploading, setUploading] = useState(false);
  const [replyUploading, setReplyUploading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<TicketAttachment[]>([]);

  const ticket = ticketQuery.data;

  const update = async (data: Parameters<typeof updateTicket.mutateAsync>[0]['data']) => {
    try {
      await updateTicket.mutateAsync({ id: ticketId, data });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMobileTicketQueryKey(ticketId) }),
        queryClient.invalidateQueries({ queryKey: getListMobileTicketsQueryKey() }),
      ]);
    } catch (error) {
      Alert.alert('Could not update ticket', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const addAttachment = async () => {
    if (!ticket) return;
    try {
      setUploading(true);
      const attachment = await pickAndUploadAttachment(requestUpload.mutateAsync);
      if (attachment) {
        await update({ attachments: [...(ticket.attachments ?? []), attachment] });
      }
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload this file.');
    } finally {
      setUploading(false);
    }
  };

  const addReplyAttachment = async () => {
    try {
      setReplyUploading(true);
      const attachment = await pickAndUploadAttachment(requestUpload.mutateAsync);
      if (attachment) setReplyAttachments((current) => [...current, attachment]);
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload this file.');
    } finally {
      setReplyUploading(false);
    }
  };

  const sendReply = async () => {
    if (!replyText.trim() || createComment.isPending || replyUploading) return;
    try {
      await createComment.mutateAsync({
        id: ticketId,
        data: {
          body: replyText.trim(),
          isPublic: true,
          attachments: replyAttachments.length ? replyAttachments : undefined,
        },
      });
      setReplyText('');
      setReplyAttachments([]);
      await queryClient.invalidateQueries({ queryKey: getListMobileTicketCommentsQueryKey(ticketId) });
      await queryClient.invalidateQueries({ queryKey: getGetMobileTicketQueryKey(ticketId) });
    } catch (error) {
      Alert.alert('Could not send reply', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  if (ticketQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!ticket) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={26} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ticket not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.link, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const priorityColor =
    ticket.priority === 'urgent'
      ? colors.destructive
      : ticket.priority === 'high'
        ? '#d97706'
        : colors.primary;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerNumber, { color: colors.mutedForeground }]}>Ticket #{ticket.id}</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.statusPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.statusText, { color: colors.foreground }]}>{label(ticket.status)}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
          <Text style={[styles.priorityText, { color: priorityColor }]}>{ticket.priority}</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            Updated {new Date(ticket.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <Text style={[styles.subject, { color: colors.foreground }]}>{ticket.subject}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {ticket.description || 'No description provided.'}
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {statuses.map((status) => (
            <Pressable
              key={status}
              onPress={() => update({ status })}
              disabled={updateTicket.isPending}
              style={[
                styles.chip,
                {
                  backgroundColor: ticket.status === status ? colors.primary : colors.card,
                  borderColor: ticket.status === status ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: ticket.status === status ? '#fff' : colors.mutedForeground }]}>
                {label(status)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Priority</Text>
        <View style={styles.chipRow}>
          {priorities.map((priority) => (
            <Pressable
              key={priority}
              onPress={() => update({ priority })}
              disabled={updateTicket.isPending}
              style={[
                styles.chip,
                {
                  backgroundColor: ticket.priority === priority ? colors.primary : colors.card,
                  borderColor: ticket.priority === priority ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: ticket.priority === priority ? '#fff' : colors.mutedForeground }]}>
                {priority}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Attachments</Text>
          <Pressable onPress={addAttachment} disabled={uploading} style={styles.addButton}>
            {uploading ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="paperclip" size={17} color={colors.primary} />}
            <Text style={[styles.addText, { color: colors.primary }]}>Add</Text>
          </Pressable>
        </View>
        {(ticket.attachments ?? []).length === 0 ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>No files attached to this ticket.</Text>
        ) : (
          (ticket.attachments ?? []).map((attachment: TicketAttachment) => (
            <View key={`${attachment.objectPath}-${attachment.uploadedAt}`} style={[styles.attachment, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.fileIcon, { backgroundColor: colors.accent }]}>
                <Feather name="file-text" size={17} color={colors.primary} />
              </View>
              <View style={styles.fileCopy}>
                <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{attachment.name}</Text>
                <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>{formatSize(attachment.size)}</Text>
              </View>
            </View>
          ))
        )}
        <View style={[styles.infoCard, { backgroundColor: colors.accent }]}>
          <Feather name="user-check" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>
            Assigned to {ticket.assignee?.name ?? 'this support agent'}. Your mobile queue is limited to tickets assigned to you.
          </Text>
        </View>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Conversation</Text>
        {commentsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.commentLoading} />
        ) : commentsQuery.isError ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>Could not load the conversation.</Text>
        ) : commentsQuery.data?.length ? (
          commentsQuery.data.map((comment) => (
            <View key={comment.id} style={[styles.comment, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.commentHeader}>
                <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.authorName ?? 'Support agent'}</Text>
                <Text style={[styles.commentDate, { color: colors.mutedForeground }]}>
                  {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Text style={[styles.commentBody, { color: colors.foreground }]}>{comment.body}</Text>
              {comment.attachments?.map((attachment) => (
                <Text key={attachment.objectPath} style={[styles.commentAttachment, { color: colors.primary }]}>
                  {attachment.name}
                </Text>
              ))}
            </View>
          ))
        ) : (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>No replies yet.</Text>
        )}
        <View style={[styles.replyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Write a public reply..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            textAlignVertical="top"
            style={[styles.replyInput, { color: colors.foreground }]}
          />
          {replyAttachments.map((attachment) => (
            <View key={attachment.objectPath} style={[styles.replyAttachment, { backgroundColor: colors.muted }]}>
              <Text numberOfLines={1} style={[styles.replyAttachmentName, { color: colors.foreground }]}>{attachment.name}</Text>
              <Pressable onPress={() => setReplyAttachments((items) => items.filter((item) => item.objectPath !== attachment.objectPath))}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <View style={styles.replyActions}>
            <Pressable onPress={addReplyAttachment} disabled={replyUploading} style={styles.replyAttachButton}>
              {replyUploading ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="paperclip" size={16} color={colors.primary} />}
              <Text style={[styles.replyAttachText, { color: colors.primary }]}>Attach</Text>
            </Pressable>
            <Pressable
              onPress={sendReply}
              disabled={!replyText.trim() || createComment.isPending || replyUploading}
              style={[styles.sendButton, { backgroundColor: colors.primary }, (!replyText.trim() || createComment.isPending || replyUploading) && styles.disabled]}
            >
              {createComment.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendText}>Send reply</Text>}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: 14 },
  iconButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerNumber: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginLeft: 4 },
  content: { padding: 20, paddingBottom: 44 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  priorityDot: { borderRadius: 4, height: 8, width: 8 },
  priorityText: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase' },
  date: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'right' },
  subject: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -0.7, lineHeight: 34, marginTop: 16 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 24, marginTop: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 30 },
  chipRow: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  chip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'capitalize' },
  statusPill: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'capitalize' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  addButton: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 26 },
  addText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  mutedText: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 12 },
  attachment: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 10, padding: 11 },
  fileIcon: { alignItems: 'center', borderRadius: 7, height: 36, justifyContent: 'center', width: 36 },
  fileCopy: { flex: 1, marginLeft: 10 },
  fileName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  fileMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  infoCard: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 9, marginTop: 28, padding: 13 },
  infoText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18 },
  commentLoading: { marginTop: 12 },
  comment: { borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 12 },
  commentHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  commentAuthor: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  commentDate: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  commentBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8 },
  commentAttachment: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 8 },
  replyCard: { borderRadius: 10, borderWidth: 1, marginTop: 12, padding: 12 },
  replyInput: { fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 76 },
  replyAttachment: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', marginTop: 8, padding: 8 },
  replyAttachmentName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  replyActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  replyAttachButton: { alignItems: 'center', flexDirection: 'row', gap: 5, padding: 6 },
  replyAttachText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sendButton: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 38, paddingHorizontal: 14 },
  sendText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
  disabled: { opacity: 0.5 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});