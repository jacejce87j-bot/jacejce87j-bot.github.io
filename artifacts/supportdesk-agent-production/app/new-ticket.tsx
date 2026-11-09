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
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerModal, isScannableTemplateField } from '@/components/BarcodeScannerModal';
import { mapVehicleLicenceBarcodeToTemplateFields } from '@/components/vehicleLicenceBarcode';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useListAgents, useListTicketTemplates } from '@workspace/api-client-react';
import {
  createTicketUploadId,
  formatAttachmentSize,
  pickTicketFiles,
  uploadTicketFile,
} from '@/components/ticketAttachments';
import type { PickedTicketFile, TicketUploadProgress } from '@/components/ticketAttachments';
import type { TicketAttachment } from '@workspace/api-client-react';
import { fetchWithFallback } from '@/lib/api';

type DeviceTypeOption = { id: number; name: string };
type OrganizationSite = { id: number; organizationId: number; name: string; address: string };
type PendingAttachmentUpload = {
  id: string;
  file: PickedTicketFile;
  status: 'queued' | 'preparing' | 'uploading' | 'failed';
  progress: number | null;
  error?: string;
};

const toLocalDateTimeInput = (date: Date) => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const mergePickedDateTime = (currentValue: string, pickedValue: Date, mode: 'date' | 'time') => {
  const currentDate = currentValue ? new Date(currentValue) : new Date();
  const nextDate = Number.isNaN(currentDate.getTime()) ? new Date() : currentDate;
  if (mode === 'date') {
    nextDate.setFullYear(pickedValue.getFullYear(), pickedValue.getMonth(), pickedValue.getDate());
  } else {
    nextDate.setHours(pickedValue.getHours(), pickedValue.getMinutes(), 0, 0);
  }
  return toLocalDateTimeInput(nextDate);
};

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
    'camera type': 'deviceType',
    cameratype: 'deviceType',
    'camera device type': 'deviceType',
    'device type': 'deviceType',
    devicetype: 'deviceType',
    'tracking type': 'trackingType',
    trackingtype: 'trackingType',
    'channel 1': 'channel',
    'channel 2': 'channel',
    'channel 3': 'channel',
    'channel 4': 'channel',
    'channel 5': 'channel',
    'channel 6': 'channel',
    'channel 7': 'channel',
    'channel 8': 'channel',
    channel1: 'channel',
    channel2: 'channel',
    channel3: 'channel',
    channel4: 'channel',
    channel5: 'channel',
    channel6: 'channel',
    channel7: 'channel',
    channel8: 'channel',
  };

  const normalized = cleaned.replace(/\s+/g, ' ');
  return aliases[normalized] ?? normalized.replace(/\s+/g, '');
};

const getTemplateFieldGroup = (field: { key: string; label?: string }) => {
  const key = String(field.key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = String(field.label ?? '').toLowerCase();
  const search = `${key} ${label}`;
  if (/tracking/.test(search)) return 'Tracking';
  if (
    /fleet|reg|vin|engine|make|model|colour|color|odo|vesa|vehicle|hours|hrs/.test(search)
  ) return 'Vehicle';
  if (/camera|device|channel/.test(search)) return 'Camera';
  return 'Other details';
};

const inferTemplateFields = (template: any) => {
  const explicitFields = Array.isArray(template?.fields) ? template.fields : [];
  if (explicitFields.length) {
    const fields = explicitFields.map((field: any) => ({
      ...field,
      key: normalizeTemplateFieldKey(field.label || field.name || field.key || ''),
      label: normalizeTemplateFieldKey(field.label || field.name || field.key || '') === 'channel'
        ? 'Channel'
        : field.label || field.name || 'Field',
    }));
    return fields.filter((field: any, index: number) => fields.findIndex((candidate: any) => candidate.key === field.key) === index);
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
    if (!label) continue;

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
  const [selectedRequesterLabel, setSelectedRequesterLabel] = useState('');
  const [selectedOrganizationLabel, setSelectedOrganizationLabel] = useState('');
  const [selectedOrganizationAddress, setSelectedOrganizationAddress] = useState('');
  const [organizationSites, setOrganizationSites] = useState<OrganizationSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState('');
  const siteRequestSequence = useRef(0);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time' | null>(null);
  const [datePickerDraft, setDatePickerDraft] = useState(new Date());
  const [requesterSearch, setRequesterSearch] = useState('');
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [isRequesterDropdownOpen, setIsRequesterDropdownOpen] = useState(false);
  const [isOrganizationDropdownOpen, setIsOrganizationDropdownOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingAttachmentUpload[]>([]);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateFields, setTemplateFields] = useState<any[] | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});
  const [scannerTarget, setScannerTarget] = useState<{ key: string; label: string } | null>(null);
  const [trackingDeviceTypes, setTrackingDeviceTypes] = useState<DeviceTypeOption[]>([]);
  const [cameraDeviceTypes, setCameraDeviceTypes] = useState<DeviceTypeOption[]>([]);
  const [deviceTypeError, setDeviceTypeError] = useState('');
  const [deviceTypesLoading, setDeviceTypesLoading] = useState(false);
  const [deviceTypeRetry, setDeviceTypeRetry] = useState(0);
  const [openTemplateDropdown, setOpenTemplateDropdown] = useState<string | null>(null);
  const [moreOptionsExpanded, setMoreOptionsExpanded] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    let active = true;
    const loadDeviceTypes = async () => {
      setDeviceTypesLoading(true);
      setDeviceTypeError('');
      try {
        const token = (globalThis as any).__AUTH_TOKEN__ ?? await AsyncStorage.getItem('userToken');
        if (!token) throw new Error('Your sign-in has expired. Sign in again to load device types.');
        const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
        const [trackingResponse, cameraResponse] = await Promise.all([
          fetchWithFallback('/api/device-types?category=tracking', { headers }),
          fetchWithFallback('/api/device-types?category=camera', { headers }),
        ]);
        if (!trackingResponse.ok || !cameraResponse.ok) {
          const failedResponse = !trackingResponse.ok ? trackingResponse : cameraResponse;
          const payload = await failedResponse.json().catch(() => null);
          throw new Error(payload?.error || `Device types could not be loaded (HTTP ${failedResponse.status}).`);
        }
        const [trackingData, cameraData] = await Promise.all([trackingResponse.json(), cameraResponse.json()]);
        if (active) {
          setTrackingDeviceTypes(Array.isArray(trackingData) ? trackingData : []);
          setCameraDeviceTypes(Array.isArray(cameraData) ? cameraData : []);
        }
      } catch (loadError) {
        if (active) setDeviceTypeError(loadError instanceof Error ? loadError.message : 'Device types could not be loaded.');
      } finally {
        if (active) setDeviceTypesLoading(false);
      }
    };
    void loadDeviceTypes();
    return () => { active = false; };
  }, [deviceTypeRetry]);

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

  const canSubmit = subject.trim().length > 0 && !createTicket.isPending && !isUploading && pendingUploads.length === 0;

  const updatePendingUpload = (uploadId: string, update: Partial<PendingAttachmentUpload>) => {
    setPendingUploads((current) => current.map((upload) =>
      upload.id === uploadId ? { ...upload, ...update } : upload
    ));
  };

  const processAttachmentUploads = async (uploads: PendingAttachmentUpload[]) => {
    setIsUploading(true);
    for (const upload of uploads) {
      updatePendingUpload(upload.id, { status: 'preparing', progress: null, error: undefined });
      try {
        const attachment = await uploadTicketFile(upload.file, upload.id, (progress: TicketUploadProgress) => {
          updatePendingUpload(upload.id, {
            status: progress.stage,
            progress: progress.progress,
          });
        });
        setAttachments((current) => current.some((existing) => existing.objectPath === attachment.objectPath)
          ? current
          : [...current, attachment]);
        setPendingUploads((current) => current.filter((pending) => pending.id !== upload.id));
      } catch (requestError) {
        updatePendingUpload(upload.id, {
          status: 'failed',
          progress: null,
          error: requestError instanceof Error ? requestError.message : 'Upload failed.',
        });
      }
    }
    setIsUploading(false);
  };

  const handlePickAttachment = async () => {
    setUploadError('');
    try {
      const files = await pickTicketFiles();
      if (!files.length) return;
      const uploads: PendingAttachmentUpload[] = files.map((file) => ({
        id: createTicketUploadId(),
        file,
        status: 'queued',
        progress: null,
      }));
      setPendingUploads((current) => [...current, ...uploads]);
      await processAttachmentUploads(uploads);
    } catch (requestError) {
      setUploadError(requestError instanceof Error ? requestError.message : 'The selected files could not be opened.');
    }
  };

  const retryAttachmentUpload = (uploadId: string) => {
    const upload = pendingUploads.find((pending) => pending.id === uploadId);
    if (upload && !isUploading) void processAttachmentUploads([upload]);
  };

  const loadOrganizationSites = async (orgId: number) => {
    const requestId = ++siteRequestSequence.current;
    setSitesLoading(true);
    setSitesError('');
    setOrganizationSites([]);
    setSelectedSiteId(null);
    setSiteDropdownOpen(false);
    try {
      const token = (globalThis as any).__AUTH_TOKEN__ ?? await AsyncStorage.getItem('userToken');
      if (!token) throw new Error('Your sign-in has expired. Sign in again to load organization sites.');
      const response = await fetchWithFallback(`/api/organizations/${orgId}/sites`, {
        headers: { Accept: 'application/json', Authorization: ['Bearer', token].join(' ') },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Organization sites could not be loaded (HTTP ${response.status}).`);
      if (!Array.isArray(payload)) throw new Error('Organization sites returned an invalid response.');
      if (requestId === siteRequestSequence.current) setOrganizationSites(payload);
    } catch (loadError) {
      if (requestId === siteRequestSequence.current) {
        setSitesError(loadError instanceof Error ? loadError.message : 'Organization sites could not be loaded.');
      }
    } finally {
      if (requestId === siteRequestSequence.current) setSitesLoading(false);
    }
  };

  const activeTemplates = (templatesQuery.data ?? []).filter((template) => template.isActive);
  const agents = agentsQuery.data ?? [];
  const selectedSite = organizationSites.find((site) => site.id === selectedSiteId);
  const jobAddress = organizationSites.length ? selectedSite?.address : selectedOrganizationAddress;
  const selectTemplate = (template: any) => {
    const resolvedFields = inferTemplateFields(template);
    setSelectedTemplateId(template.id);
    setTemplatePickerOpen(false);
    if (resolvedFields.length) {
      setTemplateFields(resolvedFields);
      const vals: Record<string, string> = Object.fromEntries(resolvedFields.map((field: any) => [
        field.key,
        typeof field.value === 'string' ? field.value : typeof field.defaultValue === 'string' ? field.defaultValue : '',
      ]));
      setTemplateFieldValues(vals);
      setDescription('');
    } else {
      setTemplateFields(null);
      setTemplateFieldValues({});
      setDescription(template.description ?? '');
    }
  };

  const openBookingDatePicker = (mode: 'date' | 'time') => {
    const currentValue = scheduledAtInput ? new Date(scheduledAtInput) : new Date();
    const value = Number.isNaN(currentValue.getTime()) ? new Date() : currentValue;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            setScheduledAtInput(mergePickedDateTime(scheduledAtInput, selectedDate, mode));
          }
        },
      });
      return;
    }

    setDatePickerDraft(value);
    setDatePickerMode(mode);
  };

  const handleDatePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) setDatePickerDraft(selectedDate);
  };

  const confirmDatePicker = () => {
    if (datePickerMode) {
      setScheduledAtInput(mergePickedDateTime(scheduledAtInput, datePickerDraft, datePickerMode));
    }
    setDatePickerMode(null);
  };

  return (
    <>
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

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Job details</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Requester *</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={requesterId === null ? 'Select requester' : `Requester: ${selectedRequesterLabel}`}
          accessibilityState={{ expanded: isRequesterDropdownOpen }}
          onPress={() => {
            const willOpen = !isRequesterDropdownOpen;
            setIsRequesterDropdownOpen(willOpen);
            setIsOrganizationDropdownOpen(false);
            if (willOpen) setRequesterSearch('');
          }}
          style={[styles.selectTrigger, { backgroundColor: colors.card, borderColor: colors.input }]}
        >
          <Text
            numberOfLines={1}
            style={[styles.selectTriggerText, { color: requesterId === null ? colors.mutedForeground : colors.foreground }]}
          >
            {requesterId === null ? 'Select requester' : selectedRequesterLabel}
          </Text>
          <Feather name={isRequesterDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
        </Pressable>
        {isRequesterDropdownOpen ? (
          <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={requesterSearch}
              onChangeText={(value) => {
                setRequesterSearch(value);
                setRequesterId(null);
              }}
              placeholder="Search requesters by name or email"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.dropdownSearch, { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground }]}
              autoCapitalize="none"
              accessibilityLabel="Search requesters"
            />
            {contactsQuery.isLoading ? (
              <Text style={[styles.dropdownMessage, { color: colors.mutedForeground }]}>Searching requesters…</Text>
            ) : contactsQuery.isError ? (
              <Pressable onPress={() => void contactsQuery.refetch()} style={styles.retryLink}>
                <Text style={[styles.retryLinkText, { color: colors.primary }]}>Requesters could not be loaded. Tap to retry.</Text>
              </Pressable>
            ) : (contactsQuery.data?.data ?? []).length ? (
              <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {(contactsQuery.data?.data ?? []).map((contact) => (
                  <Pressable
                    key={contact.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setRequesterId(contact.id);
                      setSelectedRequesterLabel(`${contact.name} (${contact.email})`);
                      setRequesterSearch('');
                      setIsRequesterDropdownOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      { borderColor: colors.border },
                      pressed && { backgroundColor: colors.accent },
                    ]}
                  >
                    <Text style={[styles.dropdownOptionText, { color: colors.foreground }]}>
                      {contact.name} ({contact.email})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.dropdownMessage, { color: colors.mutedForeground }]}>No requesters found.</Text>
            )}
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>Organization *</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={organizationId === null ? 'Select organization' : `Organization: ${selectedOrganizationLabel}`}
          accessibilityState={{ expanded: isOrganizationDropdownOpen }}
          onPress={() => {
            const willOpen = !isOrganizationDropdownOpen;
            setIsOrganizationDropdownOpen(willOpen);
            setIsRequesterDropdownOpen(false);
            if (willOpen) setOrganizationSearch('');
          }}
          style={[styles.selectTrigger, { backgroundColor: colors.card, borderColor: colors.input }]}
        >
          <Text
            numberOfLines={1}
            style={[styles.selectTriggerText, { color: organizationId === null ? colors.mutedForeground : colors.foreground }]}
          >
            {organizationId === null ? 'Select organization' : selectedOrganizationLabel}
          </Text>
          <Feather name={isOrganizationDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
        </Pressable>
        {isOrganizationDropdownOpen ? (
          <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={organizationSearch}
              onChangeText={(value) => {
                setOrganizationSearch(value);
                setOrganizationId(null);
                setSelectedOrganizationAddress('');
                siteRequestSequence.current += 1;
                setOrganizationSites([]);
                setSelectedSiteId(null);
                setSitesError('');
                setSitesLoading(false);
              }}
              placeholder="Search organizations"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.dropdownSearch, { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground }]}
              accessibilityLabel="Search organizations"
            />
            {organizationsQuery.isLoading ? (
              <Text style={[styles.dropdownMessage, { color: colors.mutedForeground }]}>Searching organizations…</Text>
            ) : organizationsQuery.isError ? (
              <Pressable onPress={() => void organizationsQuery.refetch()} style={styles.retryLink}>
                <Text style={[styles.retryLinkText, { color: colors.primary }]}>Organizations could not be loaded. Tap to retry.</Text>
              </Pressable>
            ) : (organizationsQuery.data?.data ?? []).length ? (
              <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {(organizationsQuery.data?.data ?? []).map((organization) => (
                  <Pressable
                    key={organization.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setOrganizationId(organization.id);
                      setSelectedOrganizationLabel(organization.name);
                      setSelectedOrganizationAddress(organization.address ?? '');
                      setOrganizationSearch('');
                      setIsOrganizationDropdownOpen(false);
                      void loadOrganizationSites(organization.id);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      { borderColor: colors.border },
                      pressed && { backgroundColor: colors.accent },
                    ]}
                  >
                    <Text style={[styles.dropdownOptionText, { color: colors.foreground }]}>{organization.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.dropdownMessage, { color: colors.mutedForeground }]}>No organizations found.</Text>
            )}
          </View>
        ) : null}

        {sitesLoading ? (
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Loading organization sites…</Text>
        ) : null}
        {sitesError ? (
          <View style={styles.deviceTypeErrorRow}>
            <Text style={[styles.error, { flex: 1, marginTop: 6 }]}>{sitesError}</Text>
            <Pressable accessibilityRole="button" onPress={() => organizationId !== null && void loadOrganizationSites(organizationId)}>
              <Text style={[styles.retryLinkText, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {organizationSites.length ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Site / location *</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={selectedSiteId === null ? 'Select site or location' : `Site: ${selectedSite?.name ?? ''}`}
              accessibilityState={{ expanded: siteDropdownOpen }}
              onPress={() => setSiteDropdownOpen((open) => !open)}
              style={[styles.selectTrigger, { backgroundColor: colors.card, borderColor: colors.input }]}
            >
              <Text style={[styles.selectTriggerText, { color: selectedSiteId === null ? colors.mutedForeground : colors.foreground }]}>
                {selectedSite?.name ?? 'Select a site / location'}
              </Text>
              <Feather name={siteDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </Pressable>
            {siteDropdownOpen ? (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {organizationSites.map((site) => (
                    <Pressable
                      key={site.id}
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedSiteId(site.id);
                        setSiteDropdownOpen(false);
                      }}
                      style={[styles.dropdownOption, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.dropdownOptionText, { color: colors.foreground }]}>{site.name}</Text>
                      <Text style={[styles.helperText, { color: colors.mutedForeground }]}>{site.address}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : null}
        {jobAddress ? (
          <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.foreground, marginTop: 0 }]}>Job location address</Text>
            <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
              {jobAddress}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.foreground }]}>Booking date and time</Text>
        {Platform.OS === 'web' ? (
          <TextInput
            value={scheduledAtInput}
            onChangeText={setScheduledAtInput}
            placeholder="YYYY-MM-DDTHH:mm"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
            accessibilityLabel="Booking date and time"
          />
        ) : (
          <View style={styles.bookingPickerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose booking date"
              onPress={() => openBookingDatePicker('date')}
              style={[styles.bookingPickerButton, { backgroundColor: colors.card, borderColor: colors.input }]}
            >
              <Feather name="calendar" size={17} color={colors.primary} />
              <Text style={[styles.bookingPickerText, { color: scheduledAtInput ? colors.foreground : colors.mutedForeground }]}>
                {scheduledAtInput ? new Date(scheduledAtInput).toLocaleDateString() : 'Select date'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose booking time"
              onPress={() => openBookingDatePicker('time')}
              style={[styles.bookingPickerButton, { backgroundColor: colors.card, borderColor: colors.input }]}
            >
              <Feather name="clock" size={17} color={colors.primary} />
              <Text style={[styles.bookingPickerText, { color: scheduledAtInput ? colors.foreground : colors.mutedForeground }]}>
                {scheduledAtInput ? new Date(scheduledAtInput).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Select time'}
              </Text>
            </Pressable>
            {scheduledAtInput ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear booking date and time"
                onPress={() => setScheduledAtInput('')}
                hitSlop={8}
                style={styles.clearBookingButton}
              >
                <Feather name="x-circle" size={20} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        )}
        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>Optional. Select the local appointment date and time.</Text>
        </View>

        <Text style={[styles.label, { color: colors.foreground }]}>Installation template</Text>
        {activeTemplates.length ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={selectedTemplateId === null ? 'Select installation template' : `Template: ${activeTemplates.find((template) => template.id === selectedTemplateId)?.name ?? ''}`}
              accessibilityState={{ expanded: templatePickerOpen }}
              onPress={() => setTemplatePickerOpen((open) => !open)}
              style={[styles.selectTrigger, { backgroundColor: colors.card, borderColor: colors.input }]}
            >
              <Text style={[styles.selectTriggerText, { color: selectedTemplateId === null ? colors.mutedForeground : colors.foreground }]}>
                {activeTemplates.find((template) => template.id === selectedTemplateId)?.name ?? 'Select a template'}
              </Text>
              <Feather name={templatePickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </Pressable>
            {templatePickerOpen ? (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedTemplateId(null);
                      setTemplateFields(null);
                      setTemplateFieldValues({});
                      setDescription('');
                      setTemplatePickerOpen(false);
                    }}
                    style={[styles.dropdownOption, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.dropdownOptionText, { color: colors.mutedForeground }]}>No template</Text>
                  </Pressable>
                  {activeTemplates.map((template) => (
                    <Pressable
                      key={template.id}
                      accessibilityRole="button"
                      onPress={() => selectTemplate(template)}
                      style={[styles.dropdownOption, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.dropdownOptionText, { color: colors.foreground }]}>{template.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
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
          Selecting a template shows every template field. The values are saved with the ticket and included in its description.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Job description</Text>
        {templateFields && templateFields.length ? (
          <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>Installation details</Text>
            {['Vehicle', 'Camera', 'Tracking', 'Other details'].map((group) => {
              const fields = templateFields.filter((field) => getTemplateFieldGroup(field) === group);
              if (!fields.length) return null;
              return (
                <View key={group} style={styles.templateSection}>
                  <Text style={[styles.templateSectionTitle, { color: colors.primary }]}>{group}</Text>
                  {fields.map((f) => (
                    <View key={f.key} style={styles.templateField}>
                <Text style={[styles.label, { color: colors.foreground, marginTop: 0 }]}>{f.label}{f.required ? ' *' : ''}</Text>
                {/^(channel|trackingType|deviceType)$/.test(f.key) ? (() => {
                  const isChannel = f.key === 'channel';
                  const options = isChannel
                    ? Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Channel ${index + 1}` }))
                    : f.key === 'trackingType' ? trackingDeviceTypes : cameraDeviceTypes;
                  const selectedValue = templateFieldValues[f.key] ?? '';
                  const dropdownOpen = openTemplateDropdown === f.key;
                  return (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${f.label}`}
                        accessibilityState={{ expanded: dropdownOpen }}
                        onPress={() => setOpenTemplateDropdown(dropdownOpen ? null : f.key)}
                        style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.input }]}
                      >
                        <Text style={[styles.selectTriggerText, { color: selectedValue ? colors.foreground : colors.mutedForeground }]}>
                          {selectedValue || (isChannel ? 'Select channel' : `Select ${f.key === 'trackingType' ? 'tracking' : 'camera'} device type`)}
                        </Text>
                        <Feather name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                      </Pressable>
                      {dropdownOpen ? (
                        <View style={[styles.dropdown, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {!isChannel ? (
                              <Pressable
                                onPress={() => {
                                  setTemplateFieldValues((prev) => ({ ...prev, [f.key]: '' }));
                                  setOpenTemplateDropdown(null);
                                }}
                                style={[styles.dropdownOption, { borderColor: colors.border }]}
                              >
                                <Text style={[styles.dropdownOptionText, { color: colors.mutedForeground }]}>No device selected</Text>
                              </Pressable>
                            ) : null}
                            {options.map((option) => (
                              <Pressable
                                key={option.id}
                                onPress={() => {
                                  setTemplateFieldValues((prev) => ({ ...prev, [f.key]: option.name }));
                                  setOpenTemplateDropdown(null);
                                }}
                                style={[styles.dropdownOption, { borderColor: colors.border }]}
                              >
                                <Text style={[styles.dropdownOptionText, { color: colors.foreground }]}>{option.name}</Text>
                              </Pressable>
                            ))}
                            {!isChannel && !options.length ? (
                              <Text style={[styles.dropdownMessage, { color: colors.mutedForeground }]}>
                                {deviceTypesLoading ? 'Loading device types…' : deviceTypeError || 'No device types available.'}
                              </Text>
                            ) : null}
                          </ScrollView>
                        </View>
                      ) : null}
                    </>
                  );
                })() : (
                  <View style={styles.scannableInputRow}>
                    <TextInput
                      value={templateFieldValues[f.key] ?? ''}
                      onChangeText={(text) => setTemplateFieldValues((prev) => ({ ...prev, [f.key]: text }))}
                      placeholder={f.label}
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.input, styles.scannableInput, { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground }]}
                    />
                    {isScannableTemplateField(f.key, f.label) ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Scan ${f.label}`}
                        onPress={() => setScannerTarget({ key: f.key, label: f.label })}
                        style={[styles.scanButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <Feather name="maximize" size={19} color={colors.primary} />
                        <Text style={[styles.scanButtonText, { color: colors.primary }]}>Scan</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
                  ))}
                </View>
              );
            })}
            {deviceTypeError ? (
              <View style={styles.deviceTypeErrorRow}>
                <Text style={[styles.error, { flex: 1 }]}>{deviceTypeError}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading device types"
                  onPress={() => setDeviceTypeRetry((retry) => retry + 1)}
                  disabled={deviceTypesLoading}
                >
                  <Text style={[styles.retryLinkText, { color: colors.primary }]}>
                    {deviceTypesLoading ? 'Loading…' : 'Retry'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
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

        <View style={[styles.moreOptionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={moreOptionsExpanded ? 'Hide more ticket options' : 'Show more ticket options'}
            accessibilityState={{ expanded: moreOptionsExpanded }}
            onPress={() => setMoreOptionsExpanded((expanded) => !expanded)}
            style={styles.moreOptionsHeader}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>More options</Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                {priority} · {type} · {assigneeId === null ? 'Unassigned' : agents.find((agent) => agent.id === assigneeId)?.name ?? 'Assigned'}
              </Text>
            </View>
            <Feather name={moreOptionsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
          </Pressable>
          {moreOptionsExpanded ? (
            <View style={styles.moreOptionsContent}>
              <ChoiceGroup label="Priority" values={PRIORITIES} value={priority} onChange={setPriority} colors={colors} />
              <ChoiceGroup label="Type" values={TYPES} value={type} onChange={setType} colors={colors} />
              <ChoiceGroup label="Ticket channel" values={CHANNELS} value={channel} onChange={setChannel} colors={colors} />

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
            </View>
          ) : null}
        </View>
        <View style={styles.attachmentHeader}>
          <Text style={[styles.label, styles.attachmentLabel, { color: colors.foreground }]}>Attachments</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attach files"
            disabled={isUploading}
            onPress={() => void handlePickAttachment()}
            style={({ pressed }) => [styles.attachButton, { borderColor: colors.border }, isUploading && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={[styles.attachButtonText, { color: colors.primary }]}>{isUploading ? 'Uploading…' : '+ Attach files'}</Text>
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
        {pendingUploads.length ? (
          <View style={styles.attachmentList}>
            {pendingUploads.map((upload) => (
              <View key={upload.id} style={[styles.attachmentRow, { backgroundColor: colors.card, borderColor: upload.status === 'failed' ? colors.destructive : colors.border }]}>
                {upload.status === 'failed' ? (
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                ) : (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
                <View style={styles.attachmentInfo}>
                  <Text style={[styles.attachmentName, { color: colors.foreground }]} numberOfLines={1}>{upload.file.name}</Text>
                  <Text style={[styles.attachmentMeta, { color: upload.status === 'failed' ? colors.destructive : colors.mutedForeground }]}>
                    {upload.status === 'failed'
                      ? upload.error
                      : upload.status === 'preparing'
                        ? 'Preparing preview…'
                        : upload.status === 'uploading' && upload.progress !== null
                          ? `Uploading ${upload.progress}%`
                          : upload.status === 'uploading'
                            ? 'Uploading…'
                            : 'Queued'}
                  </Text>
                </View>
                {upload.status === 'failed' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Retry upload for ${upload.file.name}`}
                    onPress={() => retryAttachmentUpload(upload.id)}
                    disabled={isUploading}
                  >
                    <Text style={[styles.retryLinkText, { color: colors.primary }]}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
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
            if (sitesLoading) {
              setError('Wait for the organization sites to finish loading before creating the ticket.');
              return;
            }
            if (sitesError) {
              setError('Load the organization sites before creating the ticket. Use Retry and select a site if available.');
              return;
            }
            if (organizationSites.length && selectedSiteId === null) {
              setError('Select a site or location before creating the ticket.');
              return;
            }
            const scheduledDate = scheduledAtInput ? new Date(scheduledAtInput) : null;
            if (scheduledDate && Number.isNaN(scheduledDate.getTime())) {
              setError('Enter the booking date and time in YYYY-MM-DDTHH:mm format.');
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
                siteId: selectedSiteId,
                assigneeId,
                attachments,
                scheduledAt: scheduledDate?.toISOString() ?? null,
                templateData: (templateFields ?? []).map((field) => ({
                  key: normalizeTemplateFieldKey(field.key || field.label),
                  label: String(field.label || field.name || field.key || 'Field'),
                  value: templateFieldValues[field.key] ?? '',
                })),
              },
            });
          }}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (!canSubmit || createTicket.isPending || isUploading) && styles.disabled, pressed && styles.pressed]}
        >
          {createTicket.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Create ticket</Text>}
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
    <Modal
      visible={Platform.OS === 'ios' && datePickerMode !== null}
      animationType="fade"
      transparent
      onRequestClose={() => setDatePickerMode(null)}
    >
      <View style={[styles.datePickerOverlay, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={[styles.datePickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.datePickerTitle, { color: colors.foreground }]}>
            {datePickerMode === 'date' ? 'Booking date' : 'Booking time'}
          </Text>
          {datePickerMode ? (
            <DateTimePicker
              value={datePickerDraft}
              mode={datePickerMode}
              display="spinner"
              onChange={handleDatePickerChange}
              is24Hour
              style={styles.iosDateTimePicker}
            />
          ) : null}
          <View style={styles.datePickerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDatePickerMode(null)}
              style={[styles.datePickerSecondaryButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.datePickerButtonText, { color: colors.foreground }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDatePicker}
              style={[styles.datePickerPrimaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.datePickerButtonText, { color: colors.primaryForeground }]}>Set {datePickerMode}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <BarcodeScannerModal
      visible={scannerTarget !== null}
      fieldLabel={scannerTarget?.label ?? 'code'}
      onClose={() => setScannerTarget(null)}
      onScanned={(value) => {
        if (scannerTarget) {
          const decodedFields = mapVehicleLicenceBarcodeToTemplateFields(value, templateFields ?? []);
          setTemplateFieldValues((current) => decodedFields
            ? { ...current, ...decodedFields }
            : { ...current, [scannerTarget.key]: value });
        }
        setScannerTarget(null);
      }}
    />
    </>
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
  scannableInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scannableInput: { flex: 1 },
  scanButton: { minHeight: 50, minWidth: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  scanButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  bookingPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingPickerButton: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingPickerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
  clearBookingButton: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', justifyContent: 'center', paddingHorizontal: 20 },
  datePickerCard: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  datePickerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  iosDateTimePicker: { alignSelf: 'stretch' },
  datePickerActions: { flexDirection: 'row', gap: 10 },
  datePickerSecondaryButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  datePickerPrimaryButton: { flex: 2, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  datePickerButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  selectTrigger: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectTriggerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  dropdown: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 },
  dropdownSearch: { minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 11, fontFamily: 'Inter_400Regular', fontSize: 14 },
  dropdownOptions: { maxHeight: 240, marginTop: 6 },
  dropdownOption: { minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  dropdownOptionText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  dropdownMessage: { padding: 12, fontFamily: 'Inter_400Regular', fontSize: 13 },
  deviceTypeErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  multilineInput: { minHeight: 120, paddingTop: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' },
  sectionCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 8 },
  templateFieldGroup: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 6 },
  templateSection: { marginTop: 8 },
  templateSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, marginBottom: 4 },
  templateField: { marginBottom: 10 },
  moreOptionsCard: { borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 18 },
  moreOptionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreOptionsContent: { marginTop: 8 },
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