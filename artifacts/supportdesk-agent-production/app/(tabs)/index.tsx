import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  getListTicketsQueryKey,
  getListAgentsQueryKey,
  getListTicketTemplatesQueryKey,
  getGetCurrentAuthUserQueryKey,
  useListAgents,
  useListTickets,
  useListTicketTemplates,
  useUpdateTicket,
  useGetCurrentAuthUser,
  type TicketAttachment,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatAttachmentSize, openTicketAttachment, pickTicketFile, uploadTicketFile } from '@/components/ticketAttachments';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';

const getToken = async () => {
  try {
    return (globalThis as any).__AUTH_TOKEN__ ?? (await AsyncStorage.getItem('userToken')) ?? '';
  } catch (e) {
    return '';
  }
};

// Current authenticated user fetched from API
type CurrentUser = { id: string; email: string; firstName?: string | null } | null;

const STATUS_OPTIONS = ['new', 'open', 'pending', 'solved', 'closed'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

export default function AgentHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const baseUrl = getProductionApiBaseUrl();

  // Fetch current auth user from backend to drive UI identity
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${baseUrl}/api/auth/user`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const user = body?.user ?? null;
        if (user) setCurrentUser({ id: user.id, email: user.email, firstName: user.firstName });
      } catch (e) {
        // ignore
      }
    })();
  }, [baseUrl]);

  // Also fetch current user via generated hook (ensures customFetch and auth token are used)
  const currentUserQuery = useGetCurrentAuthUser({
    query: {
      queryKey: getGetCurrentAuthUserQueryKey(),
      enabled: true,
    },
  });

  useEffect(() => {
    const user = (currentUserQuery.data as any)?.user ?? null;
    if (user) {
      setCurrentUser({ id: user.id, email: user.email, firstName: user.firstName });
    }
  }, [currentUserQuery.data]);

  const [activeAgentPicker, setActiveAgentPicker] = useState<number | null>(null);
  const [uploadingTicketId, setUploadingTicketId] = useState<number | null>(null);
  const [openingAttachmentKey, setOpeningAttachmentKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'open' | 'pending' | 'on_hold' | 'solved' | 'closed'>('active');

  // Edit Modal Form State
  const [editingTicket, setEditingTicket] = useState<any>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState<number | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const [editTemplateFields, setEditTemplateFields] = useState<any[] | null>(null);
  const [editTemplateValues, setEditTemplateValues] = useState<Record<string, string>>({});

  const templatesQuery = useListTicketTemplates({
    query: {
      queryKey: getListTicketTemplatesQueryKey(),
      enabled: Boolean(currentUser),
    },
  });
  const activeTemplates = useMemo(() => (templatesQuery.data ?? []).filter((template) => template.isActive), [templatesQuery.data]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const agentsQuery = useListAgents({
    query: {
      queryKey: getListAgentsQueryKey(),
      enabled: Boolean(currentUser),
    },
  });

  const ticketsQueryParams = useMemo(() => ({ limit: 50, sortBy: 'updatedAt' as const, sortDir: 'desc' as const }), []);

  const ticketsQuery = useListTickets(
    ticketsQueryParams,
    {
      query: {
        queryKey: getListTicketsQueryKey(ticketsQueryParams),
        enabled: Boolean(currentUser),
      },
    },
  );
  const firstName = currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Agent';
  const updateTicket = useUpdateTicket();
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  

  const currentAgent = useMemo(() => {
    return agents.find((a) => a.email?.toLowerCase() === currentUser?.email?.toLowerCase());
  }, [agents, currentUser]);

  const myTickets = useMemo(() => {
    const allTickets = ticketsQuery.data?.data ?? [];
    return allTickets.filter((ticket) => {
      if (currentAgent?.id != null) {
        return ticket.assigneeId === currentAgent.id;
      }
      return false;
    });
  }, [ticketsQuery.data?.data, currentAgent]);

  const filteredMyTickets = useMemo(() => {
    const activeStatuses = new Set(['open', 'pending', 'on_hold']);
    return myTickets.filter((ticket) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return activeStatuses.has(ticket.status);
      return ticket.status === statusFilter;
    });
  }, [myTickets, statusFilter]);

  const refreshTickets = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: getListTicketsQueryKey(ticketsQueryParams),
    });
  }, [queryClient, ticketsQueryParams]);

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem('userToken');
      router.replace('/(auth)/sign-in');
    } catch (error) {
      Alert.alert('Sign Out Error', 'Could not clear session data.');
    }
  };

  const handleOpenEditModal = (ticket: any) => {
    setEditingTicket(ticket);
    setEditSubject(ticket.subject || '');
    setEditDescription(ticket.description || '');
    setEditStatus(ticket.status || 'open');
    setEditPriority(ticket.priority || 'medium');
    setEditAssigneeId(ticket.assigneeId ?? null);
    setEditTemplateId(null);
    setEditTemplateFields(null);
    setEditTemplateValues({});
  };

  const applyEditTemplate = (template: any) => {
    setEditTemplateId(template.id);

    if (template.fields && template.fields.length) {
      setEditTemplateFields(template.fields);
      setEditTemplateValues(Object.fromEntries(template.fields.map((field: any) => {
        const key = String(field.key || '').replace(/[_-](.)/g, (_match, character) => String(character).toUpperCase());
        return [field.key, editingTicket?.[key] ?? editingTicket?.[field.key] ?? ''];
      })));
      setEditDescription(template.description ?? '');
      return;
    }

    setEditTemplateFields(null);
    setEditTemplateValues({});
    setEditDescription(template.description ?? editDescription ?? '');
  };

  const handleSaveTicket = async () => {
    if (!editingTicket) return;
    try {
      let finalDescription = editDescription.trim();

      if (editTemplateFields && editTemplateFields.length) {
        const missing = editTemplateFields.filter((field) => field.required && !(editTemplateValues[field.key]?.trim()));
        if (missing.length) {
          Alert.alert('Template required', `Please complete the required fields: ${missing.map((field) => field.label).join(', ')}`);
          return;
        }

        const built = editTemplateFields.map((field) => `${field.label}: ${editTemplateValues[field.key] ?? ''}`).join('\n');
        finalDescription = [built, editDescription.trim()].filter(Boolean).join('\n\n');
      }

      await updateTicket.mutateAsync({
        id: editingTicket.id,
        data: {
          subject: editSubject,
          description: finalDescription || undefined,
          status: editStatus as any,
          priority: editPriority as any,
          assigneeId: editAssigneeId,
          ...Object.fromEntries((editTemplateFields ?? []).map((field: any) => {
            const key = String(field.key || '').replace(/[_-](.)/g, (_match, character) => String(character).toUpperCase());
            return [key, editTemplateValues[field.key] ?? ''];
          })),
        },
      });
      setEditingTicket(null);
      await refreshTickets();
    } catch (requestError) {
      Alert.alert('Update failed', requestError instanceof Error ? requestError.message : 'Could not save ticket updates.');
    }
  };

  const handleAddAttachment = async (ticketId: number, currentAttachments?: TicketAttachment[]) => {
    const file = await pickTicketFile();
    if (!file) return;
    setUploadingTicketId(ticketId);
    try {
      const attachment = await uploadTicketFile(file);
      await updateTicket.mutateAsync({
        id: ticketId,
        data: { attachments: [...(currentAttachments ?? []), attachment] },
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
      await openTicketAttachment(attachment, async () => (await getToken()) ?? "", baseUrl ?? "");
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
            <Text style={[styles.title, { color: colors.foreground }]}>{greeting}, {firstName}</Text>
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
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Production workspace</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
              Authentication and ticket data are connected to the production API.
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: '#2FA36B' }]} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My queue</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {filteredMyTickets.length} shown
          </Text>
        </View>

        <View style={styles.filterRow}>
          {(['all', 'active', 'open', 'pending', 'on_hold', 'solved', 'closed'] as const).map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setStatusFilter(filter)}
              style={[
                styles.filterChip,
                { borderColor: colors.border, backgroundColor: statusFilter === filter ? colors.primary : colors.card },
              ]}
            >
              <Text style={[styles.filterChipText, { color: statusFilter === filter ? colors.primaryForeground : colors.foreground }]}>
                {filter === 'active' ? 'Active' : filter === 'on_hold' ? 'On Hold' : filter.charAt(0).toUpperCase() + filter.slice(1).replace('_', ' ')}
              </Text>
            </Pressable>
          ))}
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
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Loading tickets…</Text>
          </View>
        ) : ticketsQuery.isError ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="alert-circle" size={22} color={colors.destructive} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ticket service unavailable</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Check your connection and try again.
            </Text>
            <Pressable onPress={() => void ticketsQuery.refetch()} style={[styles.retryButton, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.retryText, { color: colors.secondaryForeground }]}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredMyTickets.length ? (
          <View style={styles.ticketList}>
            {filteredMyTickets.map((ticket) => (
              <View key={ticket.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.ticketTopRow}>
                  <Text style={[styles.ticketId, { color: colors.primary }]}>#{ticket.id}</Text>
                  <Text style={[styles.ticketOrg, { color: colors.mutedForeground }]} numberOfLines={1} ellipsizeMode="tail">{ticket.organization?.name ?? ''}</Text>
                  <Text style={[styles.ticketStatus, { color: colors.mutedForeground }]}>{ticket.status?.replace('_', ' ')}</Text>
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
                    accessibilityLabel={`Edit ticket ${ticket.id}`}
                    onPress={() => handleOpenEditModal(ticket)}
                    style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}
                  >
                    <Feather name="edit-2" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Attach a file to ticket ${ticket.id}`}
                    disabled={uploadingTicketId === ticket.id}
                    onPress={() => void handleAddAttachment(ticket.id, ticket.attachments)}
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
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tickets in your queue</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              You currently have no tickets assigned to you.
            </Text>
          </View>
        )}

        {/* --- SIGN OUT SECTION --- */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Signed in as {currentUser?.email ?? 'Unknown'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [styles.signOutButton, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
          >
            <Feather name="log-out" size={16} color={colors.secondaryForeground} />
            <Text style={[styles.signOutText, { color: colors.secondaryForeground }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Edit Ticket Modal */}
      <Modal visible={!!editingTicket} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingTicket(null)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Ticket #{editingTicket?.id}</Text>
            <Pressable onPress={() => setEditingTicket(null)}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalContent}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Subject</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={editSubject}
              onChangeText={setEditSubject}
              placeholder="Ticket Subject"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setEditStatus(status)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: editStatus === status ? colors.primary : colors.card },
                  ]}
                >
                  <Text style={[styles.chipText, { color: editStatus === status ? colors.primaryForeground : colors.foreground }]}>
                    {status.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => setEditPriority(priority)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: editPriority === priority ? colors.primary : colors.card },
                  ]}
                >
                  <Text style={[styles.chipText, { color: editPriority === priority ? colors.primaryForeground : colors.foreground }]}>
                    {priority.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Assignee</Text>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollRow}>
              <Pressable
                onPress={() => setEditAssigneeId(null)}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: editAssigneeId === null ? colors.primary : colors.card },
                ]}
              >
                <Text style={[styles.chipText, { color: editAssigneeId === null ? colors.primaryForeground : colors.foreground }]}>Unassigned</Text>
              </Pressable>
              {agents.map((agent) => (
                <Pressable
                  key={agent.id}
                  onPress={() => setEditAssigneeId(agent.id)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: editAssigneeId === agent.id ? colors.primary : colors.card },
                  ]}
                >
                  <Text style={[styles.chipText, { color: editAssigneeId === agent.id ? colors.primaryForeground : colors.foreground }]}>
                    {agent.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Template</Text>
            {activeTemplates.length ? (
              <View style={styles.chipRow}>
                {activeTemplates.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => applyEditTemplate(template)}
                    style={[styles.chip, { borderColor: colors.border, backgroundColor: editTemplateId === template.id ? colors.primary : colors.card }]}
                  >
                    <Text style={[styles.chipText, { color: editTemplateId === template.id ? colors.primaryForeground : colors.foreground }]}>
                      {template.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>No active templates available.</Text>
            )}

            {editTemplateFields && editTemplateFields.length ? (
              <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                {editTemplateFields.map((field) => (
                  <View key={field.key} style={{ gap: 6 }}>
                    <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{field.label}{field.required ? ' *' : ''}</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={editTemplateValues[field.key] ?? ''}
                      onChangeText={(text) => setEditTemplateValues((current) => ({ ...current, [field.key]: text }))}
                      placeholder={field.label}
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              placeholder="Description"
              placeholderTextColor={colors.mutedForeground}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEditingTicket(null)}
                style={[styles.modalButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSaveTicket()}
                disabled={updateTicket.isPending}
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
              >
                {updateTicket.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, gap: 22 },
  scroll: { flex: 1 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.4 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 6 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  environmentCard: { borderRadius: 8, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginBottom: 4 },
  cardText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  sectionMeta: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  filterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  ticketList: { gap: 10 },
  ticketCard: { borderRadius: 8, borderWidth: 1, padding: 14 },
  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketId: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  ticketOrg: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center', flex: 1 },
  ticketStatus: { fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'capitalize' },
  ticketSubject: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  ticketMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 7, textTransform: 'capitalize' },
  emptyCard: { borderRadius: 8, borderWidth: 1, paddingVertical: 34, paddingHorizontal: 24, alignItems: 'center' },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  retryButton: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  footer: { borderTopWidth: 1, paddingTop: 14, gap: 12, marginTop: 4 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  signOutButton: { borderRadius: 8, minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  pressed: { opacity: 0.75 },
  ticketDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
  ticketDetailLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  ticketDetailValue: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  attachments: { gap: 7, marginTop: 11 },
  attachmentRow: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentInfo: { flex: 1 },
  attachmentName: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  attachmentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
  ticketActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  agentWarning: { minHeight: 38, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentWarningText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11 },
  actionButton: { minHeight: 34, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  agentPicker: { borderWidth: 1, borderRadius: 8, marginTop: 8, paddingVertical: 4 },
  agentOption: { paddingHorizontal: 11, paddingVertical: 10 },
  agentOptionText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  disabled: { opacity: 0.5 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  modalBody: { flex: 1 },
  modalContent: { padding: 20, gap: 12, paddingBottom: 40 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 8 },
  textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 14 },
  textAreaInput: { height: 100, textAlignVertical: 'top' },
  templateFieldGroup: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  horizontalScrollRow: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});