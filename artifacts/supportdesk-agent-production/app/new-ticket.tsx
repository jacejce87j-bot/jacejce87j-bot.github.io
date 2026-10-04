import {
  getListTicketsQueryKey,
  getListAgentsQueryKey,
  getListTicketTemplatesQueryKey,
  TicketInput,
  useCreateTicket,
  useListContacts,
  useListOrganizations,
} from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useListAgents, useListTicketTemplates } from '@workspace/api-client-react';
import { formatAttachmentSize, pickTicketFile, uploadTicketFile } from '@/components/ticketAttachments';
import type { TicketAttachment } from '@workspace/api-client-react';

const PRIORITIES: TicketInput['priority'][] = ['low', 'normal', 'high', 'urgent'];
const TYPES: TicketInput['type'][] = ['question', 'incident', 'problem', 'task'];
const CHANNELS: TicketInput['channel'][] = ['web', 'email', 'chat', 'phone', 'api'];

const normalizeTemplateFieldKey = (label: string) => {
  const cleaned = String(label ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases: Record<string, string> = {
    'reg no': 'reg',
    'reg number': 'reg',
    registration: 'reg',
    'vehicle registration': 'reg',
    'vesa num': 'vesa',
    'vesa number': 'vesa',
    'vesa no': 'vesa',
    her: 'hrs',
    hour: 'hrs',
    hours: 'hrs',
    hrs: 'hrs',
    'vehicle type': 'vehicleType',
    'installation hours': 'hrs',
  };

  const normalized = cleaned.replace(/\s+/g, ' ');
  return aliases[normalized] ?? normalized.replace(/\s+/g, '');
};

const inferTemplateFields = (template: any) => {
  const explicitFields = Array.isArray(template?.fields) ? template.fields : [];
  if (explicitFields.length) {
    return explicitFields.map((field: any) => ({
      ...field,
      key: field.key || normalizeTemplateFieldKey(field.label || field.name || ''),
      label: field.label || field.name || 'Field',
    }));
  }

  const lines = String(template?.description ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fields: any[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const keyValueMatch = line.match(/^([^:]+):\s*(.*)$/);
    const label = keyValueMatch ? keyValueMatch[1].trim() : line;
    const canonicalKey = normalizeTemplateFieldKey(label);

    if (!canonicalKey || seen.has(canonicalKey)) continue;

    const value = keyValueMatch ? keyValueMatch[2].trim() : '';
    const isMeaningful = label.length > 0 && (value.length > 0 || /reg|vesa|hrs|hours|address|phone|serial|model|account/i.test(label));
    if (!isMeaningful) continue;

    seen.add(canonicalKey);
    fields.push({ key: canonicalKey, label, required: false });
  }

  return fields;
};

export default function NewTicketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  // Local auth stub replacing Clerk
  const isSignedIn = true;

  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketInput['priority']>('normal');
  const [type, setType] = useState<TicketInput['type']>('question');
  const [channel, setChannel] = useState<TicketInput['channel']>('web');
  const [requesterId, setRequesterId] = useState<number | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [requesterSearch, setRequesterSearch] = useState('');
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateFields, setTemplateFields] = useState<any[] | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState('');

  const agentsQuery = useListAgents({
    query: {
      queryKey: getListAgentsQueryKey(),
      enabled: Boolean(isSignedIn),
    },
  });
  
  const templatesQuery = useListTicketTemplates({
    query: {
      queryKey: getListTicketTemplatesQueryKey(),
      enabled: Boolean(isSignedIn),
    },
  });
  const contactsQuery = useListContacts({ q: requesterSearch || undefined, limit: 25 });
  const organizationsQuery = useListOrganizations({ q: organizationSearch || undefined, limit: 25 });

  const createTicket = useCreateTicket({
    mutation: {
      onSuccess: async (ticket) => {
        await queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        setCreatedId(ticket.id);
      },
      onError: (requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Ticket could not be created.');
      },
    },
  });

  if (createdId !== null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <View style={[styles.successIcon, { backgroundColor: colors.accent }]}>
          <Text style={[styles.successIconText, { color: colors.primary }]}>✓</Text>
        </View>
        <Text style={[styles.successTitle, { color: colors.foreground }]}>Ticket created</Text>
        <Text style={[styles.successText, { color: colors.mutedForeground }]}>
          Ticket #{createdId} is now in the SupportDesk workspace.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Return to my queue</Text>
        </Pressable>
      </View>
    );
  }

  const canSubmit = subject.trim().length > 0 && !createTicket.isPending;

  const handlePickAttachment = async () => {
    setUploadError('');
    const file = await pickTicketFile();
    if (!file) return;

    setIsUploading(true);
    try {
      const attachment = await uploadTicketFile(file);
      setAttachments((current) => [...current, attachment]);
    } catch (requestError) {
      setUploadError(requestError instanceof Error ? requestError.message : 'Attachment upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const activeTemplates = (templatesQuery.data ?? []).filter((template) => template.isActive);
  const agents = agentsQuery.data ?? [];

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + (Platform.OS === 'web' ? 102 : 84),
      }}
      bottomOffset={30}
      keyboardDismissMode="interactive"
    >
      <View style={styles.container}>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹ Back to queue</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK WORKSPACE</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Create a ticket</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Capture a customer request for the SupportDesk team.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Subject *</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of the issue"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          autoCapitalize="sentences"
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Requester *</Text>
        <TextInput
          value={requesterSearch}
          onChangeText={(value) => {
            setRequesterSearch(value);
            setRequesterId(null);
          }}
          placeholder="Search requesters by name or email"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          autoCapitalize="none"
          accessibilityLabel="Search requesters"
        />
        {requesterId === null ? (
          <View style={styles.choices}>
            {(contactsQuery.data?.data ?? []).map((contact) => (
              <Pressable
                key={contact.id}
                onPress={() => {
                  setRequesterId(contact.id);
                  setRequesterSearch(`${contact.name} (${contact.email})`);
                }}
                style={[styles.choice, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.choiceText, { color: colors.mutedForeground }]}>{contact.name} ({contact.email})</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {contactsQuery.isLoading ? <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Searching requesters…</Text> : null}
        {!contactsQuery.isLoading && !contactsQuery.isError && contactsQuery.data?.data.length === 0 ? (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>No requesters found.</Text>
        ) : null}
        {contactsQuery.isError ? (
          <Pressable onPress={() => void contactsQuery.refetch()} style={styles.retryLink}>
            <Text style={[styles.retryLinkText, { color: colors.primary }]}>Requesters could not be loaded. Tap to retry.</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>Organization *</Text>
        <TextInput
          value={organizationSearch}
          onChangeText={(value) => {
            setOrganizationSearch(value);
            setOrganizationId(null);
          }}
          placeholder="Search organizations"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          accessibilityLabel="Search organizations"
        />
        {organizationId === null ? (
          <View style={styles.choices}>
            {(organizationsQuery.data?.data ?? []).map((organization) => (
              <Pressable
                key={organization.id}
                onPress={() => {
                  setOrganizationId(organization.id);
                  setOrganizationSearch(organization.name);
                }}
                style={[styles.choice, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.choiceText, { color: colors.mutedForeground }]}>{organization.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {organizationsQuery.isLoading ? <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Searching organizations…</Text> : null}
        {!organizationsQuery.isLoading && !organizationsQuery.isError && organizationsQuery.data?.data.length === 0 ? (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>No organizations found.</Text>
        ) : null}
        {organizationsQuery.isError ? (
          <Pressable onPress={() => void organizationsQuery.refetch()} style={styles.retryLink}>
            <Text style={[styles.retryLinkText, { color: colors.primary }]}>Organizations could not be loaded. Tap to retry.</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>Description template</Text>
        {activeTemplates.length ? (
          <View style={styles.choices}>
            {activeTemplates.map((template) => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={`Use ${template.name} template`}
                onPress={() => {
                  const resolvedFields = inferTemplateFields(template);
                  setSelectedTemplateId(template.id);
                  if (resolvedFields.length) {
                    setTemplateFields(resolvedFields);
                    const vals: Record<string, string> = Object.fromEntries(resolvedFields.map((field: any) => [field.key, '']));
                    setTemplateFieldValues(vals);
                    setDescription('');
                  } else {
                    setTemplateFields(null);
                    setTemplateFieldValues({});
                    setDescription(template.description ?? '');
                  }
                }}
                style={[
                  styles.choice,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  selectedTemplateId === template.id && { backgroundColor: colors.accent, borderColor: colors.primary },
                ]}
              >
                <Text style={[styles.choiceText, { color: selectedTemplateId === template.id ? colors.accentForeground : colors.mutedForeground }]}>
                  {template.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
            {templatesQuery.isLoading
              ? 'Loading templates…'
              : templatesQuery.isError
                ? 'Templates could not be loaded.'
                : 'No active templates available.'}
          </Text>
        )}
        {templatesQuery.isError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading templates"
            onPress={() => void templatesQuery.refetch()}
            style={({ pressed }) => [styles.retryLink, pressed && styles.pressed]}
          >
            <Text style={[styles.retryLinkText, { color: colors.primary }]}>Retry loading templates</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
          Selecting a template fills the description, which you can still edit.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
        {templateFields && templateFields.length ? (
          <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.foreground, marginTop: 0 }]}>Template details</Text>
            {templateFields.map((f) => (
              <View key={f.key} style={{ marginBottom: 10 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>{f.label}{f.required ? ' *' : ''}</Text>
                <TextInput
                  value={templateFieldValues[f.key] ?? ''}
                  onChangeText={(text) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: text }))}
                  placeholder={f.label}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground }]}
                />
              </View>
            ))}
            <Text style={[styles.helperText, { color: colors.mutedForeground, marginTop: -6 }]}>These fields come from the selected template. They will be combined into the description on submit.</Text>
          </View>
        ) : null}
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Add the important details"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          multiline
          textAlignVertical="top"
        />

        <ChoiceGroup label="Priority" values={PRIORITIES} value={priority} onChange={setPriority} colors={colors} />
        <ChoiceGroup label="Type" values={TYPES} value={type} onChange={setType} colors={colors} />
        <ChoiceGroup label="Channel" values={CHANNELS} value={channel} onChange={setChannel} colors={colors} />

        <Text style={[styles.label, { color: colors.foreground }]}>Assign to agent</Text>
        <View style={styles.choices}>
          <Pressable
            onPress={() => setAssigneeId(null)}
            style={[
              styles.choice,
              { backgroundColor: colors.card, borderColor: colors.border },
              assigneeId === null && { backgroundColor: colors.accent, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.choiceText, { color: assigneeId === null ? colors.accentForeground : colors.mutedForeground }]}>Unassigned</Text>
          </Pressable>
          {agents.map((agent) => (
            <Pressable
              key={agent.id}
              onPress={() => setAssigneeId(agent.id)}
              style={[
                styles.choice,
                { backgroundColor: colors.card, borderColor: colors.border },
                assigneeId === agent.id && { backgroundColor: colors.accent, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.choiceText, { color: assigneeId === agent.id ? colors.accentForeground : colors.mutedForeground }]}>
                {agent.name}
              </Text>
            </Pressable>
          ))}
        </View>
        {agentsQuery.isLoading ? (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Loading agents…</Text>
        ) : agentsQuery.isError ? (
          <>
            <Text style={[styles.helperText, { color: colors.destructive }]}>
              Agents could not be loaded. Check the workspace connection.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading agents"
              onPress={() => void agentsQuery.refetch()}
              style={({ pressed }) => [styles.retryLink, pressed && styles.pressed]}
            >
              <Text style={[styles.retryLinkText, { color: colors.primary }]}>Retry loading agents</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.attachmentHeader}>
          <Text style={[styles.label, styles.attachmentLabel, { color: colors.foreground }]}>Attachments</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach a file"
            disabled={isUploading}
            onPress={() => void handlePickAttachment()}
            style={({ pressed }) => [styles.attachButton, { borderColor: colors.border }, isUploading && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={[styles.attachButtonText, { color: colors.primary }]}>{isUploading ? 'Uploading…' : '+ Attach file'}</Text>
          </Pressable>
        </View>
        {attachments.length ? (
          <View style={styles.attachmentList}>
            {attachments.map((attachment, index) => (
              <View key={`${attachment.objectPath}-${attachment.uploadedAt}`} style={[styles.attachmentRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="file-text" size={16} color={colors.primary} />
                <View style={styles.attachmentInfo}>
                  <Text style={[styles.attachmentName, { color: colors.foreground }]} numberOfLines={1}>{attachment.name}</Text>
                  <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>{formatAttachmentSize(attachment.size)} · {attachment.contentType}</Text>
                </View>
                <Pressable onPress={() => setAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))}>
                  <Feather name="x" size={17} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>No files attached yet.</Text>
        )}
        {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          disabled={!canSubmit}
          onPress={() => {
            setError('');
            if (requesterId === null || organizationId === null) {
              setError('Select both a requester and an organization before creating the ticket.');
              return;
            }
            let finalDescription = description.trim();
            if (templateFields && templateFields.length) {
              const missing = templateFields.filter((f) => f.required && !(templateFieldValues[f.key]?.trim()));
              if (missing.length) {
                setError(`Please fill required fields: ${missing.map((m) => m.label).join(', ')}`);
                return;
              }
              const built = templateFields.map((f) => `${f.label}: ${templateFieldValues[f.key] ?? ''}`).join('\n');
              finalDescription = [built, description.trim()].filter(Boolean).join('\n\n');
            }

            createTicket.mutate({
              data: {
                subject: subject.trim(),
                description: finalDescription || undefined,
                status: 'open',
                priority,
                type,
                channel,
                requesterId,
                organizationId,
                assigneeId,
                attachments,
              },
            });
          }}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (!canSubmit || createTicket.isPending || isUploading) && styles.disabled, pressed && styles.pressed]}
        >
          {createTicket.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Create ticket</Text>}
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function ChoiceGroup<T extends string>({
  label,
  values,
  value,
  onChange,
  colors,
}: {
  label: string;
  values: T[];
  value: T;
  onChange: (value: T) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.choices}>
        {values.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.choice,
              { backgroundColor: colors.card, borderColor: colors.border },
              value === option && { backgroundColor: colors.accent, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.choiceText, { color: value === option ? colors.accentForeground : colors.mutedForeground }]}>
              {option.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { paddingHorizontal: 22 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 22 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1, marginBottom: 9 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.6 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 24 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 9, marginTop: 13 },
  helperText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: -3 },
  retryLink: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 },
  retryLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  multilineInput: { minHeight: 120, paddingTop: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' },
  templateFieldGroup: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 6 },
  attachmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  attachmentLabel: { marginBottom: 0 },
  attachButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8 },
  attachButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  attachmentList: { gap: 8, marginTop: 8 },
  attachmentRow: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  attachmentInfo: { flex: 1 },
  attachmentName: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  attachmentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  error: { color: '#D64545', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 18 },
  button: { minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  successIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  successIconText: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  successTitle: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  authLoadingTitle: { marginTop: 18 },
  successText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 8 },
});