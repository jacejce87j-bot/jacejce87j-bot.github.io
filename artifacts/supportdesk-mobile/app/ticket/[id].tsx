import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getGetMobileTicketQueryKey,
  getListMobileTicketsQueryKey,
  useGetMobileTicket,
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
  const updateTicket = useUpdateMobileTicket();
  const requestUpload = useRequestUploadUrl();
  const [uploading, setUploading] = useState(false);

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
          <Feather name="lock" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>This mobile workspace only shows tickets assigned to you.</Text>
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
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  link: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});