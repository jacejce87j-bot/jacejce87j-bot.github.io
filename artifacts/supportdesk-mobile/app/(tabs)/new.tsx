import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import {
  useCreateMobileTicket,
  useListAgents,
  useRequestUploadUrl,
  type TicketAttachment,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { pickAndUploadAttachment } from '@/lib/upload';

const priorities = ['low', 'normal', 'high', 'urgent'] as const;

export default function NewTicketScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const createTicket = useCreateMobileTicket();
  const agentsQuery = useListAgents();
  const requestUpload = useRequestUploadUrl();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof priorities)[number]>('normal');
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [createError, setCreateError] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);

  const signedInEmail = user?.emailAddresses[0]?.emailAddress?.trim().toLowerCase();
  const currentAgent = agentsQuery.data?.find(
    (agent) => agent.email.trim().toLowerCase() === signedInEmail,
  );
  const effectiveAssigneeId = selectedAssigneeId ?? currentAgent?.id;

  const addAttachment = async () => {
    try {
      setUploadError('');
      setUploading(true);
      const attachment = await pickAndUploadAttachment(requestUpload.mutateAsync);
      if (attachment) setAttachments((current) => [...current, attachment]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload this file.';
      setUploadError(message);
      Alert.alert('Upload failed', message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!subject.trim()) return;
    try {
      setCreateError('');
      const ticket = await createTicket.mutateAsync({
        data: {
          subject: subject.trim(),
          description: description.trim() || undefined,
          priority,
          assigneeId: effectiveAssigneeId,
          attachments: attachments.length ? attachments : undefined,
        },
      });
      if (!currentAgent || ticket.assigneeId === currentAgent.id) {
        router.replace(`/ticket/${ticket.id}`);
      } else {
        Alert.alert(
          'Ticket created',
          `Assigned to ${ticket.assignee?.name ?? 'the selected agent'}. It will appear in that agent's queue.`,
          [{ text: 'Back to my queue', onPress: () => router.replace('/(tabs)') }],
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setCreateError(message);
      Alert.alert('Could not create ticket', message);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.eyebrow, { color: colors.primary }]}>NEW WORK</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Create a ticket</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Capture the issue while the context is fresh.</Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Subject</Text>
          <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} value={subject} onChangeText={setSubject} placeholder="What needs attention?" placeholderTextColor={colors.mutedForeground} />
          <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
          <TextInput style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} value={description} onChangeText={setDescription} placeholder="Add useful context for the team..." placeholderTextColor={colors.mutedForeground} multiline textAlignVertical="top" />
          <Text style={[styles.label, { color: colors.foreground }]}>Priority</Text>
          <View style={styles.priorityRow}>
            {priorities.map((item) => (
              <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priority, { backgroundColor: priority === item ? colors.primary : colors.card, borderColor: priority === item ? colors.primary : colors.border }]}>
                <Text style={[styles.priorityText, { color: priority === item ? '#fff' : colors.mutedForeground }]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>Assign to</Text>
          {agentsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : agentsQuery.isError ? (
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>
              Could not load agents. The ticket will be assigned to you.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.assigneeRow}>
              {(agentsQuery.data ?? []).map((agent) => {
                const isSelected = effectiveAssigneeId === agent.id;
                return (
                  <Pressable
                    key={agent.id}
                    onPress={() => setSelectedAssigneeId(agent.id)}
                    style={[
                      styles.assignee,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.assigneeText, { color: isSelected ? '#fff' : colors.mutedForeground }]}>
                      {agent.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={addAttachment} disabled={uploading} style={[styles.attachButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {uploading ? <ActivityIndicator color={colors.primary} /> : <Feather name="paperclip" size={17} color={colors.primary} />}
            <Text style={[styles.attachText, { color: colors.foreground }]}>{uploading ? 'Uploading…' : 'Add attachment'}</Text>
          </Pressable>
          {!!uploadError && <Text style={[styles.inlineError, { color: colors.destructive }]}>{uploadError}</Text>}
          {attachments.map((attachment) => (
            <View key={attachment.objectPath} style={[styles.attachment, { backgroundColor: colors.muted }]}>
              <Feather name="file" size={16} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.foreground }]}>{attachment.name}</Text>
              <Pressable onPress={() => setAttachments((items) => items.filter((item) => item.objectPath !== attachment.objectPath))}>
                <Feather name="x" size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <Pressable onPress={submit} disabled={!subject.trim() || createTicket.isPending || uploading} style={[styles.submit, { backgroundColor: colors.primary }, (!subject.trim() || createTicket.isPending || uploading) && styles.disabled]}>
            {createTicket.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create ticket</Text>}
          </Pressable>
          {!!createError && <Text style={[styles.inlineError, { color: colors.destructive }]}>{createError}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: -0.8, marginTop: 5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 8, marginTop: 23 },
  input: { borderRadius: 10, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  textarea: { minHeight: 150, paddingTop: 14 },
  priorityRow: { flexDirection: 'row', gap: 7 },
  priority: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  priorityText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'capitalize' },
  assigneeRow: { flexDirection: 'row', gap: 8 },
  assignee: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  assigneeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  attachButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 26, minHeight: 50 },
  attachText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  inlineError: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 9 },
  attachment: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 9, marginTop: 8, padding: 11 },
  attachmentName: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  submit: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', marginTop: 26, minHeight: 54 },
  submitText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  disabled: { opacity: 0.5 },
});