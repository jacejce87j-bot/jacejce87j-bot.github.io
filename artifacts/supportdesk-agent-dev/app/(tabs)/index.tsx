import { useAuth, useClerk, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getListTicketsQueryKey,
  getListAgentsQueryKey,
  useListAgents,
  useListTickets,
  useUpdateTicket,
  type TicketAttachment,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatAttachmentSize, openTicketAttachment, pickTicketFile, uploadTicketFile } from '@/components/ticketAttachments';

export default function AgentHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [activeAgentPicker, setActiveAgentPicker] = useState<number | null>(null);
  const [uploadingTicketId, setUploadingTicketId] = useState<number | null>(null);
  const [openingAttachmentKey, setOpeningAttachmentKey] = useState<string | null>(null);
  const agentsQuery = useListAgents({
    query: {
      queryKey: getListAgentsQueryKey(),
      enabled: Boolean(user),
    },
  });
  const ticketsQuery = useListTickets(
    { limit: 10, sortBy: 'updatedAt', sortDir: 'desc' },
    {
      query: {
        queryKey: getListTicketsQueryKey({ limit: 10, sortBy: 'updatedAt', sortDir: 'desc' }),
        enabled: Boolean(user),
      },
    },
  );
  const firstName = user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Agent';
  const updateTicket = useUpdateTicket();
  const agents = agentsQuery.data ?? [];
  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ''}`;

  const refreshTickets = async () => {
    await queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
  };

  const handleAddAttachment = async (ticketId: number, currentAttachments: TicketAttachment[]) => {
    const file = await pickTicketFile();
    if (!file) return;
    setUploadingTicketId(ticketId);
    try {
      const attachment = await uploadTicketFile(file);
      await updateTicket.mutateAsync({
        id: ticketId,
        data: { attachments: [...currentAttachments, attachment] },
      });
      await refreshTickets();
    } catch (requestError) {
      Alert.alert('Attachment failed', requestError instanceof Error ? requestError.message : 'The attachment could not be added.');
    } finally {
      setUploadingTicketId(null);
    }
  };

  const handleReassign = async (ticketId: number, assigneeId: number | null) => {
    try {
      await updateTicket.mutateAsync({ id: ticketId, data: { assigneeId } });
      setActiveAgentPicker(null);
      await refreshTickets();
    } catch (requestError) {
      Alert.alert('Assignment failed', requestError instanceof Error ? requestError.message : 'The ticket could not be reassigned.');
    }
  };

  const handleOpenAttachment = async (attachment: TicketAttachment) => {
    const key = `${attachment.objectPath}-${attachment.uploadedAt}`;
    setOpeningAttachmentKey(key);
    try {
      await openTicketAttachment(attachment, () => getToken(), baseUrl);
    } catch (requestError) {
      Alert.alert('Attachment unavailable', requestError instanceof Error ? requestError.message : 'The attachment could not be opened.');
    } finally {
      setOpeningAttachmentKey(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 102 : 84),
          },
        ]}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK AGENT</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Good morning, {firstName}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Your assigned work will appear here.
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.accentForeground }]}>
              {firstName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={[styles.environmentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
            <Feather name="tool" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Development environment</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
              Authentication and ticket data are connected to the development API.
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: '#2FA36B' }]} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My queue</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {ticketsQuery.data?.total ?? 0} total
          </Text>
        </View>
        {agentsQuery.isError ? (
          <View style={[styles.agentWarning, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="users" size={16} color={colors.destructive} />
            <Text style={[styles.agentWarningText, { color: colors.mutedForeground }]}>
              Agent directory unavailable.
            </Text>
            <Pressable onPress={() => void agentsQuery.refetch()}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {ticketsQuery.isLoading ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading development tickets…</Text>
          </View>
        ) : ticketsQuery.isError ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="alert-circle" size={22} color={colors.destructive} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ticket service unavailable</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Check the development API workflow and try again.
            </Text>
            <Pressable onPress={() => void ticketsQuery.refetch()} style={[styles.retryButton, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.retryText, { color: colors.secondaryForeground }]}>Retry</Text>
            </Pressable>
          </View>
        ) : ticketsQuery.data?.data.length ? (
          <View style={styles.ticketList}>
            {ticketsQuery.data.data.map((ticket) => (
              <View key={ticket.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.ticketTopRow}>
                  <Text style={[styles.ticketId, { color: colors.primary }]}>#{ticket.id}</Text>
                  <Text style={[styles.ticketStatus, { color: colors.mutedForeground }]}>{ticket.status.replace('_', ' ')}</Text>
                </View>
                <Text style={[styles.ticketSubject, { color: colors.foreground }]} numberOfLines={2}>{ticket.subject}</Text>
                <Text style={[styles.ticketMeta, { color: colors.mutedForeground }]}>
                  {ticket.priority} priority · {ticket.type}
                </Text>
                <View style={styles.ticketDetailRow}>
                  <Text style={[styles.ticketDetailLabel, { color: colors.mutedForeground }]}>Assigned to</Text>
                  <Text style={[styles.ticketDetailValue, { color: colors.foreground }]}>{ticket.assignee?.name ?? 'Unassigned'}</Text>
                </View>
                {ticket.attachments?.length ? (
                  <View style={styles.attachments}>
                    {ticket.attachments.map((attachment) => {
                      const key = `${attachment.objectPath}-${attachment.uploadedAt}`;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityLabel={`Open attachment ${attachment.name}`}
                          onPress={() => void handleOpenAttachment(attachment)}
                          style={[styles.attachmentRow, { backgroundColor: colors.background, borderColor: colors.border }]}
                        >
                          <Feather name="file-text" size={15} color={colors.primary} />
                          <View style={styles.attachmentInfo}>
                            <Text style={[styles.attachmentName, { color: colors.foreground }]} numberOfLines={1}>{attachment.name}</Text>
                            <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
                              {formatAttachmentSize(attachment.size)} · {attachment.contentType}
                            </Text>
                          </View>
                          {openingAttachmentKey === key ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={15} color={colors.mutedForeground} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.ticketActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Attach a file to ticket ${ticket.id}`}
                    disabled={uploadingTicketId === ticket.id}
                    onPress={() => void handleAddAttachment(ticket.id, ticket.attachments ?? [])}
                    style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, uploadingTicketId === ticket.id && styles.disabled, pressed && styles.pressed]}
                  >
                    <Feather name="paperclip" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>{uploadingTicketId === ticket.id ? 'Uploading…' : 'Attach file'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reassign ticket ${ticket.id}`}
                    onPress={() => setActiveAgentPicker(activeAgentPicker === ticket.id ? null : ticket.id)}
                    style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  >
                    <Feather name="user" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Reassign</Text>
                  </Pressable>
                </View>
                {activeAgentPicker === ticket.id ? (
                  <View style={[styles.agentPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Pressable onPress={() => void handleReassign(ticket.id, null)} style={styles.agentOption}>
                      <Text style={[styles.agentOptionText, { color: ticket.assigneeId == null ? colors.primary : colors.mutedForeground }]}>Unassigned</Text>
                    </Pressable>
                    {agents.map((agent) => (
                      <Pressable key={agent.id} onPress={() => void handleReassign(ticket.id, agent.id)} style={styles.agentOption}>
                        <Text style={[styles.agentOptionText, { color: ticket.assigneeId === agent.id ? colors.primary : colors.mutedForeground }]}>{agent.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="inbox" size={22} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tickets yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Create the first development ticket from this workspace.
            </Text>
          </View>
        )}

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Signed in as {user?.primaryEmailAddress?.emailAddress || 'development user'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void signOut(() => router.replace('/'))}
            style={({ pressed }) => [styles.signOutButton, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
          >
            <Feather name="log-out" size={16} color={colors.secondaryForeground} />
            <Text style={[styles.signOutText, { color: colors.secondaryForeground }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    gap: 22,
  },
  scroll: {
    flex: 1,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  environmentCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginBottom: 4,
  },
  cardText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  sectionMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  ticketList: {
    gap: 10,
  },
  ticketCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketId: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  ticketStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  ticketSubject: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  ticketMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 7,
    textTransform: 'capitalize',
  },
  emptyCard: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 7,
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 12,
    marginTop: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  signOutButton: {
    borderRadius: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  signOutText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.75,
  },
  ticketDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 11,
  },
  ticketDetailLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  ticketDetailValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  attachments: {
    gap: 7,
    marginTop: 11,
  },
  attachmentRow: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  attachmentMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 2,
  },
  ticketActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  agentWarning: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentWarningText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  actionButton: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  agentPicker: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 8,
    paddingVertical: 4,
  },
  agentOption: {
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  agentOptionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
});
