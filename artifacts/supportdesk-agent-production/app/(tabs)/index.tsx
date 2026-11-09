import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState, useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, SvgXml } from 'react-native-svg';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Image,
  Linking,
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
import { BarcodeScannerModal, isScannableTemplateField } from '@/components/BarcodeScannerModal';
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
import { createTicketUploadId, formatAttachmentSize, loadTicketAttachmentPreview, loadTicketSvgPreview, openTicketAttachment, pickTicketFiles, uploadTicketData, uploadTicketFile } from '@/components/ticketAttachments';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';
import { fetchWithFallback } from '@/lib/api';
import { WebView } from 'react-native-webview';

const getToken = async () => {
  try {
    return (globalThis as any).__AUTH_TOKEN__ ?? (await AsyncStorage.getItem('userToken')) ?? '';
  } catch (e) {
    return '';
  }
};

// Current authenticated user fetched from API
type CurrentUser = { id: string; email: string; firstName?: string | null } | null;
type StockItem = { id: number; name: string; sku: string | null; unit: string; quantityOnHand: number };
type FieldAgent = {
  id: number;
  name: string;
  inventory: { stockItemId: number; quantityOnHand: number }[];
};
type TicketStockUsage = {
  id: number;
  stockItemId: number;
  stockItemName: string;
  unit: string;
  fieldAgentId: number | null;
  fieldAgentName: string | null;
  quantity: number;
  deductedAt: string | null;
};
type PendingTicketAttachment = {
  id: string;
  file: import('@/components/ticketAttachments').PickedTicketFile;
  status: 'queued' | 'preparing' | 'uploading' | 'saving' | 'failed';
  progress: number | null;
  error?: string;
  attachment?: TicketAttachment;
};
type DeviceTypeOption = { id: number; name: string };
type MapLocation = {
  siteId: number | null;
  organizationId: number | null;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  lookupError?: string;
};

const normalizeEditTemplateFieldKey = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
    'installation hours': 'hrs',
    'camera type': 'deviceType',
    cameratype: 'deviceType',
    'camera device type': 'deviceType',
    'device type': 'deviceType',
    devicetype: 'deviceType',
    'tracking type': 'trackingType',
    trackingtype: 'trackingType',
    'tracking device type': 'trackingType',
    'channel 1': 'channel',
    'channel 2': 'channel',
    'channel 3': 'channel',
    'channel 4': 'channel',
    'channel 5': 'channel',
    'channel 6': 'channel',
    'channel 7': 'channel',
    'channel 8': 'channel',
  };
  return aliases[normalized] ?? normalized.replace(/\s+/g, '');
};

type TicketTemplateFieldData = { key?: string | null; label?: string | null; value?: string | null };

const getTicketAssetIdentifiers = (templateData?: TicketTemplateFieldData[] | null) => {
  let registration: string | undefined;
  let fleetNumber: string | undefined;

  for (const field of templateData ?? []) {
    const keys = [field.key, field.label].map(normalizeEditTemplateFieldKey);
    const value = field.value?.trim();
    if (!value) continue;

    if (!registration && keys.some((key) => [
      'reg',
      'regno',
      'regnumber',
      'registrationno',
      'registrationnumber',
      'vehiclereg',
      'vehicleregistration',
      'vehicleregistrationnumber',
      'platenumber',
      'numberplate',
      'licenseplate',
    ].includes(key))) {
      registration = value;
    }

    if (!fleetNumber && keys.some((key) => ['fleet', 'fleetno', 'fleetnum', 'fleetnumber'].includes(key))) {
      fleetNumber = value;
    }
  }

  return { registration, fleetNumber };
};

const getEditTemplateFields = (template: any) => {
  const explicitFields = Array.isArray(template?.fields) ? template.fields : [];
  const sourceFields = explicitFields.length
    ? explicitFields
    : String(template?.description ?? '').split(/\r?\n/).map((line: string) => {
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      return match
        ? { key: match[1].trim(), label: match[1].trim(), value: match[2].trim() }
        : { key: line.trim(), label: line.trim() };
    }).filter((field: any) => field.label);

  return sourceFields
    .map((field: any) => {
      const key = normalizeEditTemplateFieldKey(field.label || field.name || field.key || '');
      return {
        ...field,
        key,
        label: key === 'channel' ? 'Channel' : field.label || field.name || field.key || 'Field',
      };
    })
    .filter((field: any, index: number, fields: any[]) =>
      fields.findIndex((candidate: any) => candidate.key === field.key) === index
    );
};

const extractEditTemplateValues = (description: string, fields: any[]) => {
  const values: Record<string, string> = {};
  const remainingLines: string[] = [];

  for (const line of description.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) {
      remainingLines.push(line);
      continue;
    }

    const label = normalizeEditTemplateFieldKey(match[1]);
    const field = fields.find((candidate) =>
      label === normalizeEditTemplateFieldKey(candidate.key)
      || label === normalizeEditTemplateFieldKey(candidate.label)
    );
    if (!field) {
      remainingLines.push(line);
      continue;
    }

    values[field.key] = match[2].trim();
  }

  return {
    values,
    description: remainingLines.join('\n').replace(/^\s+|\s+$/g, ''),
  };
};

const normalizeEditTemplateDeviceField = (field: any) => {
  const key = String(field.key || field.label || field.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['cameratype', 'cameradevicetype', 'devicetype'].includes(key)) {
    return { ...field, key: 'deviceType' };
  }
  if (['trackingtype', 'trackingdevicetype'].includes(key)) {
    return { ...field, key: 'trackingType' };
  }
  return field;
};

type EditTemplateFieldGroupId = 'vehicle' | 'hardware' | 'camera' | 'other';
type EditTemplateFieldGroup = {
  id: EditTemplateFieldGroupId;
  title: string;
  fields: any[];
};

const EDIT_TEMPLATE_FIELD_GROUPS: Array<Pick<EditTemplateFieldGroup, 'id' | 'title'>> = [
  { id: 'vehicle', title: 'Vehicle Identity' },
  { id: 'hardware', title: 'Hardware & Telemetry' },
  { id: 'camera', title: 'Camera Configuration' },
  { id: 'other', title: 'Other Details' },
];

const getEditTemplateFieldGroup = (field: any): EditTemplateFieldGroupId => {
  const key = String(field.key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = String(field.label || field.name || '').toLowerCase();
  const normalizedLabel = label.replace(/[^a-z0-9]/g, '');

  if ([
    'fleetnum', 'fleetnumber', 'reg', 'registration', 'vin', 'engine',
    'make', 'model', 'colour', 'color', 'odo', 'odometer',
  ].includes(key) || /\b(vehicle|fleet|registration|vin|engine|make|model|colour|color|odometer)\b/.test(label)) {
    return 'vehicle';
  }

  if (
    key === 'channel' ||
    key.includes('vesa') ||
    /camera|channel|vesa|hikvision|mdvr|dvr|recorder/.test(normalizedLabel)
  ) {
    return 'camera';
  }

  if (
    ['devicetype', 'trackingtype'].includes(key) ||
    /imei|cell|sim|device|tracking|serial|hardware|icc/.test(normalizedLabel)
  ) {
    return 'hardware';
  }

  return 'other';
};

const groupEditTemplateFields = (fields: any[]): EditTemplateFieldGroup[] =>
  EDIT_TEMPLATE_FIELD_GROUPS.map((group) => ({
    ...group,
    fields: fields.filter((field) => getEditTemplateFieldGroup(field) === group.id),
  })).filter((group) => group.fields.length > 0);

const getInitialExpandedEditTemplateSections = (fields: any[] = []): Record<EditTemplateFieldGroupId, boolean> => {
  const firstGroup = groupEditTemplateFields(fields)[0]?.id ?? 'vehicle';
  return {
    vehicle: firstGroup === 'vehicle',
    hardware: firstGroup === 'hardware',
    camera: firstGroup === 'camera',
    other: firstGroup === 'other',
  };
};

const STATUS_OPTIONS = ['new', 'open', 'pending', 'solved', 'closed'];
type MobileTicketPriority = 'low' | 'medium' | 'high' | 'urgent';
type ApiTicketPriority = 'low' | 'normal' | 'high' | 'urgent';
const PRIORITY_OPTIONS: MobileTicketPriority[] = ['low', 'medium', 'high', 'urgent'];
const SIGNATURE_CANVAS_HEIGHT = 280;

const toMobilePriority = (priority?: ApiTicketPriority | null): MobileTicketPriority =>
  priority === 'normal' ? 'medium' : priority ?? 'medium';

const toApiPriority = (priority: MobileTicketPriority): ApiTicketPriority =>
  priority === 'medium' ? 'normal' : priority;

const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
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
  return toLocalDateTimeInput(nextDate.toISOString());
};

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const encodeUtf8Base64 = (value: string) => {
  const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return { base64: btoa(bytes), size: bytes.length };
};

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
        const res = await fetchWithFallback('/api/auth/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const user = body?.user ?? null;
        if (user?.mustChangePassword) {
          router.replace('/(auth)/change-password');
          return;
        }
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
      if (user.mustChangePassword) {
        router.replace('/(auth)/change-password');
        return;
      }
      setCurrentUser({ id: user.id, email: user.email, firstName: user.firstName });
    }
  }, [currentUserQuery.data]);

  const [activeAgentPicker, setActiveAgentPicker] = useState<number | null>(null);
  const [uploadingTicketId, setUploadingTicketId] = useState<number | null>(null);
  const [pendingTicketAttachments, setPendingTicketAttachments] = useState<Record<number, PendingTicketAttachment[]>>({});
  const [openingAttachmentKey, setOpeningAttachmentKey] = useState<string | null>(null);
  const [previewedImage, setPreviewedImage] = useState<{ name: string; uri: string; contentType: string } | null>(null);
  const [previewingAttachmentKey, setPreviewingAttachmentKey] = useState<string | null>(null);
  const [mapLocation, setMapLocation] = useState<MapLocation | null>(null);
  const [mapLocationLoading, setMapLocationLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'open' | 'pending' | 'on_hold' | 'solved' | 'closed'>('active');

  // Edit Modal Form State
  const [editingTicket, setEditingTicket] = useState<any>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editDatePickerMode, setEditDatePickerMode] = useState<'date' | 'time' | null>(null);
  const [editDatePickerDraft, setEditDatePickerDraft] = useState(new Date());
  const [clientSignOffName, setClientSignOffName] = useState('');
  const [signatureStrokes, setSignatureStrokes] = useState<string[]>([]);
  const [signatureDraftStrokes, setSignatureDraftStrokes] = useState<string[]>([]);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureCanvasWidth, setSignatureCanvasWidth] = useState(0);
  const [isSavingSignOff, setIsSavingSignOff] = useState(false);
  const [editPriority, setEditPriority] = useState<MobileTicketPriority>('medium');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState<number | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const [editTemplatePickerOpen, setEditTemplatePickerOpen] = useState(false);
  const [editTemplateFields, setEditTemplateFields] = useState<any[] | null>(null);
  const [editTemplateValues, setEditTemplateValues] = useState<Record<string, string>>({});
  const [scannerTarget, setScannerTarget] = useState<{ key: string; label: string } | null>(null);
  const [expandedEditTemplateSections, setExpandedEditTemplateSections] = useState<Record<EditTemplateFieldGroupId, boolean>>(
    () => getInitialExpandedEditTemplateSections(),
  );
  const [editTemplateInitializedForTicketId, setEditTemplateInitializedForTicketId] = useState<number | null>(null);
  const [trackingDeviceTypes, setTrackingDeviceTypes] = useState<DeviceTypeOption[]>([]);
  const [cameraDeviceTypes, setCameraDeviceTypes] = useState<DeviceTypeOption[]>([]);
  const [deviceTypeError, setDeviceTypeError] = useState('');
  const [deviceTypesLoading, setDeviceTypesLoading] = useState(false);
  const [deviceTypeRetry, setDeviceTypeRetry] = useState(0);
  const [openEditTemplateDropdown, setOpenEditTemplateDropdown] = useState<string | null>(null);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [fieldAgents, setFieldAgents] = useState<FieldAgent[]>([]);
  const [ticketStockUsage, setTicketStockUsage] = useState<TicketStockUsage[]>([]);
  const [selectedFieldAgentId, setSelectedFieldAgentId] = useState<number | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [stockQuantity, setStockQuantity] = useState('1');
  const [isSavingStockUsage, setIsSavingStockUsage] = useState(false);
  const selectedFieldAgent = fieldAgents.find((agent) => agent.id === selectedFieldAgentId) ?? null;
  const groupedEditTemplateFields = useMemo(
    () => groupEditTemplateFields(editTemplateFields ?? []),
    [editTemplateFields],
  );

  useEffect(() => {
    let active = true;
    const loadDeviceTypes = async () => {
      setDeviceTypesLoading(true);
      setDeviceTypeError('');
      try {
        const token = await getToken();
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

  const loadStockItems = useCallback(async () => {
    const token = await getToken();
    const response = await fetchWithFallback('/api/stock', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Unable to load stock (HTTP ${response.status}).`);
    setStockItems(payload.data ?? []);
  }, []);

  const loadFieldAgents = useCallback(async () => {
    const token = await getToken();
    const response = await fetchWithFallback('/api/stock/field-agents', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Unable to load Field Agents (HTTP ${response.status}).`);
    setFieldAgents(payload.data ?? []);
  }, []);

  const loadTicketStockUsage = useCallback(async (ticketId: number) => {
    const token = await getToken();
    const response = await fetchWithFallback(`/api/tickets/${ticketId}/stock-usage`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Unable to load ticket stock use (HTTP ${response.status}).`);
    setTicketStockUsage(payload.data ?? []);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void Promise.all([loadStockItems(), loadFieldAgents()]).catch((error) => {
      Alert.alert('Stock unavailable', error instanceof Error ? error.message : 'Unable to load stock and Field Agents.');
    });
  }, [currentUser?.id, loadFieldAgents, loadStockItems]);

  const templatesQuery = useListTicketTemplates({
    query: {
      queryKey: getListTicketTemplatesQueryKey(),
      enabled: Boolean(currentUser),
    },
  });
  const activeTemplates = useMemo(() => (templatesQuery.data ?? []).filter((template) => template.isActive), [templatesQuery.data]);

  useEffect(() => {
    if (!editingTicket || !templatesQuery.isSuccess || editTemplateInitializedForTicketId === editingTicket.id) return;

    const savedValues = new Map<string, string>();
    for (const savedField of editingTicket.templateData ?? []) {
      const value = String(savedField.value ?? '');
      savedValues.set(normalizeEditTemplateFieldKey(savedField.key), value);
      savedValues.set(normalizeEditTemplateFieldKey(savedField.label), value);
    }

    const candidates = activeTemplates.map((template) => {
      const fields = getEditTemplateFields(template);
      const extracted = extractEditTemplateValues(String(editingTicket.description ?? ''), fields);
      const savedMatches = fields.filter((field: any) =>
        savedValues.has(normalizeEditTemplateFieldKey(field.key))
        || savedValues.has(normalizeEditTemplateFieldKey(field.label))
      ).length;
      const descriptionMatches = Object.keys(extracted.values).length;
      return {
        template,
        fields,
        extracted,
        score: savedMatches * 1000 + descriptionMatches,
      };
    }).filter((candidate) => candidate.fields.length && candidate.score > 0)
      .sort((left, right) => right.score - left.score);

    const matched = candidates[0];
    if (matched) {
      setEditTemplateId(matched.template.id);
      setEditTemplateFields(matched.fields);
      setExpandedEditTemplateSections(getInitialExpandedEditTemplateSections(matched.fields));
      setEditTemplateValues(Object.fromEntries(matched.fields.map((field: any) => [
        field.key,
        savedValues.get(normalizeEditTemplateFieldKey(field.key))
          ?? savedValues.get(normalizeEditTemplateFieldKey(field.label))
          ?? matched.extracted.values[field.key]
          ?? '',
      ])));
      setEditDescription(matched.extracted.description);
    }
    setEditTemplateInitializedForTicketId(editingTicket.id);
  }, [activeTemplates, editTemplateInitializedForTicketId, editingTicket, templatesQuery.isSuccess]);

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

  const firstName = currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Agent';
  const updateTicket = useUpdateTicket();
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  const currentAgent = useMemo(() => {
    return agents.find((a) => a.email?.toLowerCase() === currentUser?.email?.toLowerCase());
  }, [agents, currentUser]);

  const ticketsQueryParams = useMemo(() => ({
    limit: 50,
    sortBy: 'scheduledAt' as const,
    sortDir: 'asc' as const,
    ...(currentAgent?.id != null ? { assigneeId: currentAgent.id } : {}),
  }), [currentAgent?.id]);

  const ticketsQuery = useListTickets(
    ticketsQueryParams,
    {
      query: {
        queryKey: getListTicketsQueryKey(ticketsQueryParams),
        enabled: Boolean(currentUser && currentAgent),
      },
    },
  );

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
    }).sort((left, right) => {
      const leftBookedAt = left.scheduledAt ? Date.parse(left.scheduledAt) : Number.POSITIVE_INFINITY;
      const rightBookedAt = right.scheduledAt ? Date.parse(right.scheduledAt) : Number.POSITIVE_INFINITY;
      const leftTime = Number.isFinite(leftBookedAt) ? leftBookedAt : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(rightBookedAt) ? rightBookedAt : Number.POSITIVE_INFINITY;
      if (leftTime === rightTime) return 0;
      return leftTime - rightTime;
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
    setEditDatePickerMode(null);
    setEditDatePickerDraft(new Date());
    setClientSignOffName(ticket.requester?.name || ticket.client || '');
    setSignatureStrokes([]);
    setSignatureDraftStrokes([]);
    setSignatureModalOpen(false);
    setSignatureCanvasWidth(0);
    setEditPriority(toMobilePriority(ticket.priority));
    setEditScheduledAt(toLocalDateTimeInput(ticket.scheduledAt));
    setEditAssigneeId(ticket.assigneeId ?? null);
    setEditTemplateId(null);
    setEditTemplatePickerOpen(false);
    setEditTemplateFields(null);
    setEditTemplateValues({});
    setEditTemplateInitializedForTicketId(null);
    setTicketStockUsage([]);
    setSelectedFieldAgentId(null);
    setSelectedStockId(null);
    setStockQuantity('1');
    void loadTicketStockUsage(ticket.id).catch((error) => {
      Alert.alert('Stock unavailable', error instanceof Error ? error.message : 'Unable to load stock used on this ticket.');
    });
  };

  const handleAddStockUsage = async () => {
    const quantity = Number(stockQuantity);
    if (!editingTicket || !selectedFieldAgentId || !selectedStockId || !Number.isSafeInteger(quantity) || quantity < 1) return;

    setIsSavingStockUsage(true);
    try {
      const token = await getToken();
      const response = await fetchWithFallback(`/api/tickets/${editingTicket.id}/stock-usage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          fieldAgentId: selectedFieldAgentId,
          items: [{ stockItemId: selectedStockId, quantity }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Unable to record stock use (HTTP ${response.status}).`);
      await Promise.all([loadStockItems(), loadFieldAgents()]);
      await loadTicketStockUsage(editingTicket.id);
      setSelectedStockId(null);
      setStockQuantity('1');
      Alert.alert('Stock recorded', "The Field Agent's balance was reduced immediately.");
    } catch (error) {
      Alert.alert('Could not record stock', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSavingStockUsage(false);
    }
  };

  const handleRemoveStockUsage = async (usageId: number) => {
    if (!editingTicket) return;
    try {
      const token = await getToken();
      const response = await fetchWithFallback(`/api/tickets/${editingTicket.id}/stock-usage/${usageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Unable to remove stock use (HTTP ${response.status}).`);
      }
      await Promise.all([loadStockItems(), loadFieldAgents()]);
      await loadTicketStockUsage(editingTicket.id);
    } catch (error) {
      Alert.alert('Could not remove stock', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const applyEditTemplate = (template: any) => {
    setEditTemplateId(template.id);
    setEditTemplatePickerOpen(false);

    const templateFields = getEditTemplateFields(template).map(normalizeEditTemplateDeviceField);
    setExpandedEditTemplateSections(getInitialExpandedEditTemplateSections(templateFields));
    if (templateFields.length) {
      setEditTemplateFields(templateFields);
      const savedValues = new Map<string, string>();
      for (const field of editingTicket?.templateData ?? []) {
        const value = String(field.value ?? '');
        savedValues.set(normalizeEditTemplateFieldKey(field.key), value);
        savedValues.set(normalizeEditTemplateFieldKey(field.label), value);
      }
      const extracted = extractEditTemplateValues(editDescription || String(editingTicket?.description ?? ''), templateFields);
      setEditTemplateValues(Object.fromEntries(templateFields.map((field: any) => {
        return [
          field.key,
          savedValues.get(normalizeEditTemplateFieldKey(field.key))
            ?? savedValues.get(normalizeEditTemplateFieldKey(field.label))
            ?? extracted.values[field.key]
            ?? field.value
            ?? '',
        ];
      })));
      setEditDescription(extracted.description);
      return;
    }

    setEditTemplateFields(null);
    setEditTemplateValues({});
  };

  const handleSaveTicket = async () => {
    if (!editingTicket) return;
    try {
      let finalDescription = editDescription.trim();
      const needsClientSignOff = ['solved', 'closed'].includes(editStatus);
      const existingClientSignature = (editingTicket.attachments ?? []).some((attachment: TicketAttachment) =>
        attachment.name.toLowerCase().startsWith('client-signature-')
      );
      let signatureAttachment: TicketAttachment | null = null;

      if (editTemplateFields && editTemplateFields.length) {
        const missing = editTemplateFields.filter((field) => field.required && !(editTemplateValues[field.key]?.trim()));
        if (missing.length) {
          const missingGroups = new Set(missing.map(getEditTemplateFieldGroup));
          setExpandedEditTemplateSections((current) => ({
            ...current,
            ...Object.fromEntries([...missingGroups].map((group) => [group, true])),
          }));
          Alert.alert('Template required', `Please complete the required fields: ${missing.map((field) => field.label).join(', ')}`);
          return;
        }
      }

      if (needsClientSignOff && !existingClientSignature) {
        if (!clientSignOffName.trim()) {
          Alert.alert('Client sign-off required', 'Enter the client’s name before completing this job.');
          return;
        }
        if (!signatureStrokes.some((stroke) => stroke.includes(' L '))) {
          Alert.alert('Client sign-off required', 'Ask the client to sign in the signature box before completing this job.');
          return;
        }

        const width = Math.max(signatureCanvasWidth, 320);
        const svg = [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${SIGNATURE_CANVAS_HEIGHT}" viewBox="0 0 ${width} ${SIGNATURE_CANVAS_HEIGHT}">`,
          `<title>Client sign-off: ${escapeXml(clientSignOffName.trim())}</title>`,
          '<rect width="100%" height="100%" fill="#ffffff"/>',
          ...signatureStrokes.map((stroke) =>
            `<path d="${stroke}" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
          ),
          '</svg>',
        ].join('');
        const safeName = clientSignOffName.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'client';
        const encoded = encodeUtf8Base64(svg);
        setIsSavingSignOff(true);
        try {
          signatureAttachment = await uploadTicketData(
            `client-signature-${safeName}.svg`,
            'image/svg+xml',
            encoded.base64,
            encoded.size,
          );
        } finally {
          setIsSavingSignOff(false);
        }
      }

      await updateTicket.mutateAsync({
        id: editingTicket.id,
        data: {
          subject: editSubject,
          description: finalDescription || undefined,
          status: editStatus as any,
          priority: toApiPriority(editPriority),
          scheduledAt: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
          assigneeId: editAssigneeId,
          ...(signatureAttachment
            ? { attachments: [...(editingTicket.attachments ?? []), signatureAttachment] }
            : {}),
          ...(editTemplateFields ? {
            templateData: editTemplateFields.map((field: any) => ({
              key: String(field.key || field.label || ''),
              label: String(field.label || field.name || field.key || 'Field'),
              value: editTemplateValues[field.key] ?? '',
            })),
          } : {}),
        },
      });
      if (editStatus === 'closed') await loadStockItems();
      setEditingTicket(null);
      await refreshTickets();
    } catch (requestError) {
      Alert.alert('Update failed', requestError instanceof Error ? requestError.message : 'Could not save ticket updates.');
    }
  };

  const openEditDatePicker = (mode: 'date' | 'time') => {
    const currentValue = editScheduledAt ? new Date(editScheduledAt) : new Date();
    const value = Number.isNaN(currentValue.getTime()) ? new Date() : currentValue;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode,
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            setEditScheduledAt(mergePickedDateTime(editScheduledAt, selectedDate, mode));
          }
        },
      });
      return;
    }

    setEditDatePickerDraft(value);
    setEditDatePickerMode(mode);
  };

  const handleEditDatePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) setEditDatePickerDraft(selectedDate);
  };

  const confirmEditDatePicker = () => {
    if (editDatePickerMode) {
      setEditScheduledAt(mergePickedDateTime(editScheduledAt, editDatePickerDraft, editDatePickerMode));
    }
    setEditDatePickerMode(null);
  };

  const openClientSignature = () => {
    Keyboard.dismiss();
    setSignatureDraftStrokes(signatureStrokes);
    setSignatureModalOpen(true);
  };

  const acceptClientSignature = () => {
    if (!signatureDraftStrokes.some((stroke) => stroke.includes(' L '))) {
      Alert.alert('Signature needed', 'Ask the client to sign in the box before continuing.');
      return;
    }
    setSignatureStrokes(signatureDraftStrokes);
    setSignatureModalOpen(false);
  };

  const updatePendingTicketAttachment = (ticketId: number, uploadId: string, update: Partial<PendingTicketAttachment>) => {
    setPendingTicketAttachments((current) => ({
      ...current,
      [ticketId]: (current[ticketId] ?? []).map((upload) =>
        upload.id === uploadId ? { ...upload, ...update } : upload
      ),
    }));
  };

  const processTicketAttachmentUploads = async (
    ticketId: number,
    uploads: PendingTicketAttachment[],
    currentAttachments: TicketAttachment[] = [],
  ) => {
    if (uploadingTicketId !== null) return;
    setUploadingTicketId(ticketId);
    let attachmentsToSave = [...currentAttachments];
    try {
      for (const upload of uploads) {
        let attachment = upload.attachment;
        updatePendingTicketAttachment(ticketId, upload.id, {
          status: attachment ? 'saving' : 'preparing',
          progress: null,
          error: undefined,
        });
        try {
          if (!attachment) {
            attachment = await uploadTicketFile(upload.file, upload.id, (progress) => {
              updatePendingTicketAttachment(ticketId, upload.id, {
                status: progress.stage,
                progress: progress.progress,
              });
            });
          }
          updatePendingTicketAttachment(ticketId, upload.id, { status: 'saving', attachment, progress: null });
          const nextAttachments = attachmentsToSave.some((existing) => existing.objectPath === attachment?.objectPath)
            ? attachmentsToSave
            : [...attachmentsToSave, attachment];
          await updateTicket.mutateAsync({
            id: ticketId,
            data: { attachments: nextAttachments },
          });
          attachmentsToSave = nextAttachments;
          setPendingTicketAttachments((current) => ({
            ...current,
            [ticketId]: (current[ticketId] ?? []).filter((pending) => pending.id !== upload.id),
          }));
        } catch (uploadError) {
          updatePendingTicketAttachment(ticketId, upload.id, {
            status: 'failed',
            progress: null,
            attachment,
            error: uploadError instanceof Error ? uploadError.message : 'Upload failed.',
          });
        }
      }
      try {
        await refreshTickets();
      } catch (refreshError) {
        Alert.alert('Attachments saved', refreshError instanceof Error ? `Files were added, but the queue did not refresh: ${refreshError.message}` : 'Files were added, but the queue did not refresh.');
      }
    } finally {
      setUploadingTicketId(null);
    }
  };

  const handleAddAttachment = async (ticketId: number, currentAttachments?: TicketAttachment[]) => {
    try {
      const files = await pickTicketFiles();
      if (!files.length) return;
      const uploads: PendingTicketAttachment[] = files.map((file) => ({
        id: createTicketUploadId(),
        file,
        status: 'queued',
        progress: null,
      }));
      setPendingTicketAttachments((current) => ({
        ...current,
        [ticketId]: [...(current[ticketId] ?? []), ...uploads],
      }));
      await processTicketAttachmentUploads(ticketId, uploads, currentAttachments);
    } catch (requestError) {
      Alert.alert('Attachment failed', requestError instanceof Error ? requestError.message : 'The selected files could not be opened.');
    }
  };

  const retryTicketAttachment = (ticketId: number, currentAttachments: TicketAttachment[] = []) => {
    const uploads = (pendingTicketAttachments[ticketId] ?? []).filter((upload) => upload.status === 'failed');
    if (uploads.length) void processTicketAttachmentUploads(ticketId, uploads, currentAttachments);
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

  const handlePreviewAttachment = async (attachment: TicketAttachment) => {
    const key = `${attachment.objectPath}-${attachment.uploadedAt}`;
    setPreviewingAttachmentKey(key);
    try {
      const isSvg = attachment.contentType?.toLowerCase() === 'image/svg+xml';
      const uri = isSvg
        ? await loadTicketSvgPreview(attachment, getToken, baseUrl ?? '')
        : await loadTicketAttachmentPreview(attachment, getToken, baseUrl ?? '');
      setPreviewedImage({ name: attachment.name, uri, contentType: attachment.contentType });
    } catch (requestError) {
      Alert.alert('Image unavailable', requestError instanceof Error ? requestError.message : 'The image could not be opened.');
    } finally {
      setPreviewingAttachmentKey(null);
    }
  };

  const handleOpenSiteMap = async (ticket: any) => {
    const location: MapLocation = {
      siteId: ticket.siteId ?? null,
      organizationId: ticket.organizationId ?? null,
      name: ticket.siteName || 'Job location',
      address: ticket.siteAddress || ticket.organization?.address || '',
      latitude: null,
      longitude: null,
    };
    setMapLocation(location);

    if (location.siteId === null || location.organizationId === null) return;

    setMapLocationLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your sign-in has expired. Sign in again to load site coordinates.');
      const response = await fetchWithFallback(`/api/organizations/${location.organizationId}/sites`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Site coordinates could not be loaded (HTTP ${response.status}).`);
      if (!Array.isArray(payload)) throw new Error('Organization sites returned an invalid response.');

      const site = payload.find((candidate: any) => candidate.id === location.siteId);
      if (site) {
        setMapLocation((current) => current?.siteId === location.siteId
          ? {
            ...current,
            name: site.name || current.name,
            address: site.address || current.address,
            latitude: typeof site.latitude === 'number' ? site.latitude : null,
            longitude: typeof site.longitude === 'number' ? site.longitude : null,
          }
          : current);
      } else {
        setMapLocation((current) => current?.siteId === location.siteId
          ? { ...current, lookupError: 'The site record is no longer available. You can still navigate using the saved address.' }
          : current);
      }
    } catch (error) {
      setMapLocation((current) => current?.siteId === location.siteId
        ? {
          ...current,
          lookupError: error instanceof Error ? error.message : 'Site coordinates could not be loaded. You can still navigate using the saved address.',
        }
        : current);
    } finally {
      setMapLocationLoading(false);
    }
  };

  const handleStartNavigation = async () => {
    if (!mapLocation) return;
    const destination = mapLocation.latitude !== null && mapLocation.longitude !== null
      ? `${mapLocation.latitude},${mapLocation.longitude}`
      : mapLocation.address;
    if (!destination) {
      Alert.alert('Location unavailable', 'This job does not have coordinates or a saved address for navigation.');
      return;
    }

    const encodedDestination = encodeURIComponent(destination);
    const webDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving`;
    const navigationUrl = Platform.OS === 'android'
      ? mapLocation.latitude !== null && mapLocation.longitude !== null
        ? `google.navigation:q=${encodedDestination}&mode=d`
        : `google.navigation:q=${encodedDestination}&mode=d`
      : Platform.OS === 'ios'
        ? `https://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`
        : webDirectionsUrl;

    try {
      await Linking.openURL(navigationUrl);
    } catch {
      try {
        await Linking.openURL(webDirectionsUrl);
      } catch (error) {
        Alert.alert('Navigation unavailable', error instanceof Error ? error.message : 'Could not open a navigation app.');
      }
    }
  };

  const mapPreviewUrl = useMemo(() => {
    if (!mapLocation) return '';
    if (mapLocation.latitude !== null && mapLocation.longitude !== null) {
      const lat = mapLocation.latitude;
      const lon = mapLocation.longitude;
      const latitudeOffset = 0.008;
      const longitudeOffset = 0.012;
      const bounds = `${lon - longitudeOffset},${lat - latitudeOffset},${lon + longitudeOffset},${lat + latitudeOffset}`;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${lat},${lon}`;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(mapLocation.address)}&z=15&output=embed`;
  }, [mapLocation]);

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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(['all', 'active', 'open', 'pending', 'on_hold', 'solved', 'closed'] as const).map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setStatusFilter(filter)}
              accessibilityRole="button"
              accessibilityState={{ selected: statusFilter === filter }}
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
        </ScrollView>

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
            {filteredMyTickets.map((ticket) => {
              const assetIdentifiers = getTicketAssetIdentifiers(ticket.templateData);
              return (
              <View key={ticket.id} style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.ticketTopRow}>
                  <Text style={[styles.ticketId, { color: colors.primary }]}>#{ticket.id}</Text>
                  <Text style={[styles.ticketOrg, { color: colors.mutedForeground }]} numberOfLines={1} ellipsizeMode="tail">{ticket.organization?.name ?? ''}</Text>
                  <Text style={[styles.ticketStatus, { color: colors.mutedForeground }]}>{ticket.status?.replace('_', ' ')}</Text>
                </View>
                <Text style={[styles.ticketSubject, { color: colors.foreground }]} numberOfLines={2}>{ticket.subject}</Text>
                {assetIdentifiers.registration || assetIdentifiers.fleetNumber ? (
                  <View style={styles.assetBadgeRow}>
                    {assetIdentifiers.registration ? (
                      <View style={[styles.assetBadge, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
                        <Text style={[styles.assetBadgeLabel, { color: colors.primary }]}>REG</Text>
                        <Text style={[styles.assetBadgeValue, { color: colors.accentForeground }]}>{assetIdentifiers.registration}</Text>
                      </View>
                    ) : null}
                    {assetIdentifiers.fleetNumber ? (
                      <View style={[styles.assetBadge, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
                        <Text style={[styles.assetBadgeLabel, { color: colors.primary }]}>FLEET</Text>
                        <Text style={[styles.assetBadgeValue, { color: colors.accentForeground }]}>{assetIdentifiers.fleetNumber}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Text style={[styles.ticketMeta, { color: colors.mutedForeground }]}>
                  {ticket.priority} priority · {ticket.type}
                </Text>
                {ticket.siteAddress || ticket.organization?.address ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View map for ${ticket.siteName || 'job address'}`}
                    onPress={() => void handleOpenSiteMap(ticket)}
                    style={({ pressed }) => [styles.siteLocationButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.ticketDetailLabel, { color: colors.mutedForeground }]}>
                      {ticket.siteName ? `Job location · ${ticket.siteName}` : 'Job address'}
                    </Text>
                    <View style={styles.siteAddressRow}>
                      <Text style={[styles.ticketDetailValue, styles.siteAddressText, { color: colors.primary }]}>
                        {ticket.siteAddress ?? ticket.organization?.address}
                      </Text>
                      <Feather name="map-pin" size={15} color={colors.primary} />
                    </View>
                    <Text style={[styles.siteMapHint, { color: colors.primary }]}>Tap to view map and navigate</Text>
                  </Pressable>
                ) : null}
                {ticket.scheduledAt ? (
                  <View style={styles.ticketDetailRow}>
                    <Text style={[styles.ticketDetailLabel, { color: colors.mutedForeground }]}>Booked for</Text>
                    <Text style={[styles.ticketDetailValue, { color: colors.foreground }]}>
                      {new Date(ticket.scheduledAt).toLocaleString()}
                    </Text>
                  </View>
                ) : null}
                {ticket.templateData?.filter((field) => field.value).map((field) => (
                  <View key={field.key} style={styles.ticketDetailRow}>
                    <Text style={[styles.ticketDetailLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                    <Text style={[styles.ticketDetailValue, { color: colors.foreground }]}>{field.value}</Text>
                  </View>
                ))}
                <View style={styles.ticketDetailRow}>
                  <Text style={[styles.ticketDetailLabel, { color: colors.mutedForeground }]}>Assigned to</Text>
                  <Text style={[styles.ticketDetailValue, { color: colors.foreground }]}>{ticket.assignee?.name ?? 'Unassigned'}</Text>
                </View>
                {ticket.attachments?.length ? (
                  <View style={styles.attachments}>
                    {ticket.attachments.map((attachment) => {
                      const key = `${attachment.objectPath}-${attachment.uploadedAt}`;
                      return (
                        <View key={key}>
                          {attachment.contentType?.toLowerCase().startsWith('image/') && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Preview image ${attachment.name}`}
                              onPress={() => void handlePreviewAttachment(attachment)}
                              disabled={previewingAttachmentKey === key}
                              style={[styles.imagePreviewButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                            >
                              {previewingAttachmentKey === key ? (
                                <ActivityIndicator color={colors.primary} />
                              ) : (
                                <Feather name="image" size={18} color={colors.primary} />
                              )}
                              <Text style={[styles.imagePreviewText, { color: colors.primary }]}>
                                {previewingAttachmentKey === key ? 'Loading preview…' : 'View image'}
                              </Text>
                            </Pressable>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Download attachment ${attachment.name}`}
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
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {pendingTicketAttachments[ticket.id]?.length ? (
                  <View style={styles.pendingAttachmentList}>
                    {pendingTicketAttachments[ticket.id].map((upload) => (
                      <View key={upload.id} style={[styles.pendingAttachmentRow, { backgroundColor: colors.background, borderColor: upload.status === 'failed' ? colors.destructive : colors.border }]}>
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
                                : upload.status === 'saving'
                                  ? 'Adding to ticket…'
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
                            onPress={() => retryTicketAttachment(ticket.id, ticket.attachments ?? [])}
                            disabled={uploadingTicketId !== null}
                          >
                            <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
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
                    disabled={uploadingTicketId !== null}
                    onPress={() => void handleAddAttachment(ticket.id, ticket.attachments)}
                    style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, uploadingTicketId === ticket.id && styles.disabled, pressed && styles.pressed]}
                  >
                    <Feather name="paperclip" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>{uploadingTicketId === ticket.id ? 'Uploading…' : 'Attach files'}</Text>
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
              );
            })}
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

      <Modal visible={mapLocation !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMapLocation(null)}>
        <View style={[styles.mapModalContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.mapModalHeading}>
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {mapLocation?.name ?? 'Job location'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close map"
              onPress={() => setMapLocation(null)}
              hitSlop={8}
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={styles.mapAddressBlock}>
            <Text style={[styles.cardText, { color: colors.foreground }]}>
              {mapLocation?.address || 'No saved address'}
            </Text>
            {mapLocation?.latitude !== null && mapLocation?.latitude !== undefined
              && mapLocation?.longitude !== null && mapLocation?.longitude !== undefined ? (
                <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
                  {mapLocation.latitude.toFixed(6)}, {mapLocation.longitude.toFixed(6)}
                </Text>
              ) : null}
          </View>
          {mapLocationLoading ? (
            <View style={[styles.mapLoading, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Loading site coordinates…</Text>
            </View>
          ) : null}
          {mapLocation?.lookupError ? (
            <View style={[styles.mapLookupWarning, { backgroundColor: colors.secondary }]}>
              <Feather name="alert-circle" size={16} color={colors.mutedForeground} />
              <Text style={[styles.attachmentMeta, { color: colors.mutedForeground, flex: 1 }]}>
                {mapLocation.lookupError}
              </Text>
            </View>
          ) : null}
          {Platform.OS === 'web' ? (
            <View style={[styles.mapWebFallback, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="map" size={32} color={colors.primary} />
              <Text style={[styles.cardText, { color: colors.mutedForeground, textAlign: 'center' }]}>
                Open the map in your browser or navigation app.
              </Text>
            </View>
          ) : (
            <WebView
              key={mapPreviewUrl}
              source={{ uri: mapPreviewUrl }}
              style={styles.mapWebView}
              originWhitelist={['https://*']}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={[styles.mapLoading, { backgroundColor: colors.card }]}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Loading map…</Text>
                </View>
              )}
            />
          )}
          <View style={[styles.mapModalFooter, { paddingBottom: Math.max(insets.bottom, 14), borderTopColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void handleStartNavigation()}
              style={({ pressed }) => [styles.navigationButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              <Feather name="navigation" size={18} color={colors.primaryForeground} />
              <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>Start navigation</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={previewedImage !== null} animationType="fade" transparent onRequestClose={() => setPreviewedImage(null)}>
        <View style={styles.imagePreviewOverlay}>
          <View style={[styles.imagePreviewModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.imagePreviewHeader}>
              <Text style={[styles.imagePreviewTitle, { color: colors.foreground }]} numberOfLines={1}>{previewedImage?.name}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
                onPress={() => setPreviewedImage(null)}
                hitSlop={10}
              >
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            {previewedImage?.contentType?.toLowerCase() === 'image/svg+xml' ? (
              <SvgXml xml={previewedImage.uri} width="100%" height={240} />
            ) : previewedImage ? (
              <Image
                source={{ uri: previewedImage.uri }}
                style={styles.previewImage}
                resizeMode="contain"
                accessibilityLabel={previewedImage.name}
              />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Edit Ticket Modal */}
      <Modal visible={!!editingTicket} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => {
        setEditDatePickerMode(null);
        setEditingTicket(null);
      }}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Ticket #{editingTicket?.id}</Text>
            <Pressable onPress={() => {
              setEditDatePickerMode(null);
              setEditingTicket(null);
            }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.modalBody}
            contentContainerStyle={styles.modalContent}
            bottomOffset={30}
            keyboardDismissMode="interactive"
          >
            {editingTicket?.siteAddress || editingTicket?.organization?.address ? (
              <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 0 }]}>
                  {editingTicket.siteName ? `Job location · ${editingTicket.siteName}` : 'Job address'}
                </Text>
                <Text style={[styles.cardText, { color: colors.foreground }]}>
                  {editingTicket.siteAddress ?? editingTicket.organization?.address}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Booking date and time</Text>
            {Platform.OS === 'web' ? (
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={editScheduledAt}
                onChangeText={setEditScheduledAt}
                placeholder="YYYY-MM-DDTHH:mm"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Booking date and time"
              />
            ) : (
              <View style={styles.bookingPickerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose booking date"
                  onPress={() => openEditDatePicker('date')}
                  style={[styles.bookingPickerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Feather name="calendar" size={17} color={colors.primary} />
                  <Text style={[styles.bookingPickerText, { color: editScheduledAt ? colors.foreground : colors.mutedForeground }]}>
                    {editScheduledAt ? new Date(editScheduledAt).toLocaleDateString() : 'Select date'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose booking time"
                  onPress={() => openEditDatePicker('time')}
                  style={[styles.bookingPickerButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Feather name="clock" size={17} color={colors.primary} />
                  <Text style={[styles.bookingPickerText, { color: editScheduledAt ? colors.foreground : colors.mutedForeground }]}>
                    {editScheduledAt ? new Date(editScheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Select time'}
                  </Text>
                </Pressable>
                {editScheduledAt ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear booking date and time"
                    onPress={() => setEditScheduledAt('')}
                    hitSlop={8}
                    style={styles.clearBookingButton}
                  >
                    <Feather name="x-circle" size={20} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            )}
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
            {['solved', 'closed'].includes(editStatus) ? (
              <View style={[styles.signOffCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 0 }]}>Client sign-off</Text>
                {((editingTicket?.attachments ?? []) as TicketAttachment[]).some((attachment) =>
                  attachment.name.toLowerCase().startsWith('client-signature-')
                ) ? (
                  <View style={styles.signedNotice}>
                    <Feather name="check-circle" size={18} color={colors.primary} />
                    <Text style={[styles.cardText, { color: colors.foreground, flex: 1 }]}>
                      Client signature is already attached to this job.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
                      Ask the client to sign below to confirm the job is complete.
                    </Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={clientSignOffName}
                      onChangeText={setClientSignOffName}
                      placeholder="Client name"
                      placeholderTextColor={colors.mutedForeground}
                      accessibilityLabel="Client name for sign-off"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={signatureStrokes.length ? 'Review or replace client signature' : 'Open client signature pad'}
                      onPress={openClientSignature}
                      style={[styles.signaturePreview, { backgroundColor: '#ffffff', borderColor: colors.border }]}
                    >
                      {signatureStrokes.length ? (
                        <Svg width="100%" height={96}>
                          {signatureStrokes.map((stroke, index) => (
                            <Path key={index} d={stroke} fill="none" stroke="#111827" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                          ))}
                        </Svg>
                      ) : (
                        <View style={styles.signaturePrompt}>
                          <Feather name="edit-3" size={18} color={colors.primary} />
                          <Text style={[styles.signaturePromptText, { color: colors.primary }]}>Tap to capture client signature</Text>
                        </View>
                      )}
                    </Pressable>
                    <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
                      {signatureStrokes.length ? 'Tap to review or replace the signature.' : 'The signature opens in a separate screen to keep the form still.'}
                    </Text>
                  </>
                )}
              </View>
            ) : null}

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Stock used</Text>
            <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
              Stock is deducted from the selected Field Agent as soon as it is added to this ticket.
            </Text>
            {ticketStockUsage.length ? (
              <View style={styles.stockUsageList}>
                {ticketStockUsage.map((usage) => (
                  <View key={usage.id} style={[styles.stockUsageRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attachmentName, { color: colors.foreground }]}>{usage.stockItemName}</Text>
                      <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
                        {usage.deductedAt
                          ? `Deducted from ${usage.fieldAgentName ?? 'stock'}`
                          : 'Not deducted'}
                      </Text>
                    </View>
                    <View style={styles.stockUsageTrailing}>
                      <Text style={[styles.ticketDetailValue, { color: colors.foreground }]}>{usage.quantity} {usage.unit}</Text>
                      <Pressable
                        onPress={() => void handleRemoveStockUsage(usage.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${usage.stockItemName} from ticket`}
                        hitSlop={8}
                      >
                        <Feather name="trash-2" size={16} color={colors.destructive} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.cardText, { color: colors.mutedForeground }]}>No stock recorded for this ticket.</Text>
            )}
            {editingTicket?.status === 'closed' ? null : (
              <>
                <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Field Agent</Text>
                {fieldAgents.length ? (
                  <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollRow}>
                    {fieldAgents.map((agent) => (
                      <Pressable
                        key={agent.id}
                        onPress={() => {
                          setSelectedFieldAgentId(agent.id);
                          setSelectedStockId(null);
                        }}
                        style={[
                          styles.chip,
                          { borderColor: colors.border, backgroundColor: selectedFieldAgentId === agent.id ? colors.primary : colors.card },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: selectedFieldAgentId === agent.id ? colors.primaryForeground : colors.foreground }]}>
                          {agent.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
                    No Field Agents are available. Add them from the web Stock page.
                  </Text>
                )}

                <Text style={[styles.cardText, { color: colors.mutedForeground }]}>Available stock with Field Agent</Text>
                {selectedFieldAgent && stockItems.some((item) =>
                  selectedFieldAgent.inventory.some((balance) => balance.stockItemId === item.id && balance.quantityOnHand > 0),
                ) ? (
                  <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollRow}>
                    {stockItems
                      .filter((item) => selectedFieldAgent.inventory.some((balance) => balance.stockItemId === item.id && balance.quantityOnHand > 0))
                      .map((item) => {
                        const available = selectedFieldAgent.inventory.find((balance) => balance.stockItemId === item.id)?.quantityOnHand ?? 0;
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => setSelectedStockId(item.id)}
                            style={[
                              styles.chip,
                              { borderColor: colors.border, backgroundColor: selectedStockId === item.id ? colors.primary : colors.card },
                            ]}
                          >
                            <Text style={[styles.chipText, { color: selectedStockId === item.id ? colors.primaryForeground : colors.foreground }]}>
                              {item.name} ({available} {item.unit})
                            </Text>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                ) : selectedFieldAgent ? (
                  <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
                    No stock items are available. Add them from the web Stock page.
                  </Text>
                ) : (
                  <Text style={[styles.cardText, { color: colors.mutedForeground }]}>
                    Select a Field Agent to see their available stock.
                  </Text>
                )}

                <View style={styles.stockUsageActions}>
                  <TextInput
                    style={[styles.stockQuantityInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                    value={stockQuantity}
                    onChangeText={setStockQuantity}
                    keyboardType="number-pad"
                    placeholder="Quantity"
                    placeholderTextColor={colors.mutedForeground}
                    accessibilityLabel="Quantity of stock used"
                  />
                  <Pressable
                    onPress={() => void handleAddStockUsage()}
                    disabled={isSavingStockUsage || !selectedFieldAgentId || !selectedStockId || !Number.isSafeInteger(Number(stockQuantity)) || Number(stockQuantity) < 1}
                    style={[styles.modalButton, { backgroundColor: colors.primary }, (isSavingStockUsage || !selectedFieldAgentId || !selectedStockId) && styles.disabled]}
                  >
                    <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>
                      {isSavingStockUsage ? 'Saving…' : 'Add stock'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

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
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editTemplateId === null ? 'Select ticket template' : `Template: ${activeTemplates.find((template) => template.id === editTemplateId)?.name ?? ''}`}
                  accessibilityState={{ expanded: editTemplatePickerOpen }}
                  onPress={() => setEditTemplatePickerOpen((open) => !open)}
                  style={[styles.selectTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.selectTriggerText, { color: editTemplateId === null ? colors.mutedForeground : colors.foreground }]}>
                    {activeTemplates.find((template) => template.id === editTemplateId)?.name ?? 'Select a template'}
                  </Text>
                  <Feather name={editTemplatePickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                </Pressable>
                {editTemplatePickerOpen ? (
                  <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const restoredTemplateDetails = (editTemplateFields ?? []).map((field) =>
                            `${field.label}: ${editTemplateValues[field.key] ?? ''}`
                          );
                          setEditDescription((description) =>
                            [restoredTemplateDetails.join('\n'), description].filter(Boolean).join('\n\n')
                          );
                          setEditTemplateId(null);
                          setEditTemplateFields(null);
                          setEditTemplateValues({});
                          setEditTemplatePickerOpen(false);
                        }}
                        style={[styles.dropdownOption, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.dropdownOptionText, { color: colors.mutedForeground }]}>No template</Text>
                      </Pressable>
                      {activeTemplates.map((template) => (
                        <Pressable
                          key={template.id}
                          accessibilityRole="button"
                          onPress={() => applyEditTemplate(template)}
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
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>No active templates available.</Text>
            )}

            {editTemplateFields && editTemplateFields.length ? (
              <View style={[styles.templateFieldGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {groupedEditTemplateFields.map((group) => {
                  const expanded = expandedEditTemplateSections[group.id];
                  const requiredCount = group.fields.filter((field) => field.required).length;
                  return (
                    <View key={group.id} style={[styles.templateAccordion, { borderColor: colors.border }]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${group.title}, ${group.fields.length} fields${requiredCount ? `, ${requiredCount} required` : ''}`}
                        accessibilityState={{ expanded }}
                        onPress={() => setExpandedEditTemplateSections((current) => ({
                          ...current,
                          [group.id]: !current[group.id],
                        }))}
                        style={styles.templateAccordionHeader}
                      >
                        <View style={styles.templateAccordionHeading}>
                          <Text style={[styles.templateAccordionTitle, { color: colors.foreground }]}>{group.title}</Text>
                          <Text style={[styles.templateAccordionSummary, { color: colors.mutedForeground }]}>
                            {group.fields.length} {group.fields.length === 1 ? 'field' : 'fields'}
                            {requiredCount ? ` · ${requiredCount} required` : ''}
                          </Text>
                        </View>
                        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                      </Pressable>
                      {expanded ? (
                        <View style={styles.templateAccordionFields}>
                          {group.fields.map((field) => (
                  <View key={field.key} style={{ gap: 6 }}>
                    <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>{field.label}{field.required ? ' *' : ''}</Text>
                    {/^(channel|trackingType|deviceType)$/.test(field.key) ? (() => {
                      const isChannel = field.key === 'channel';
                      const options = isChannel
                        ? Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Channel ${index + 1}` }))
                        : field.key === 'trackingType' ? trackingDeviceTypes : cameraDeviceTypes;
                      const selectedValue = editTemplateValues[field.key] ?? '';
                      const dropdownOpen = openEditTemplateDropdown === field.key;
                      return (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${field.label}`}
                            accessibilityState={{ expanded: dropdownOpen }}
                            onPress={() => setOpenEditTemplateDropdown(dropdownOpen ? null : field.key)}
                            style={[styles.selectTrigger, { backgroundColor: colors.background, borderColor: colors.border }]}
                          >
                            <Text style={[styles.selectTriggerText, { color: selectedValue ? colors.foreground : colors.mutedForeground }]}>
                              {selectedValue || (isChannel ? 'Select channel' : `Select ${field.key === 'trackingType' ? 'tracking' : 'camera'} device type`)}
                            </Text>
                            <Feather name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                          </Pressable>
                          {dropdownOpen ? (
                            <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                              <ScrollView style={styles.dropdownOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                {!isChannel ? (
                                  <Pressable
                                    onPress={() => {
                                      setEditTemplateValues((current) => ({ ...current, [field.key]: '' }));
                                      setOpenEditTemplateDropdown(null);
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
                                      setEditTemplateValues((current) => ({ ...current, [field.key]: option.name }));
                                      setOpenEditTemplateDropdown(null);
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
                          style={[styles.textInput, styles.scannableInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                          value={editTemplateValues[field.key] ?? ''}
                          onChangeText={(text) => setEditTemplateValues((current) => ({ ...current, [field.key]: text }))}
                          placeholder={field.label}
                          placeholderTextColor={colors.mutedForeground}
                        />
                        {isScannableTemplateField(field.key, field.label) ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Scan ${field.label}`}
                            onPress={() => setScannerTarget({ key: field.key, label: field.label })}
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
                      ) : null}
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
                      <Text style={[styles.retryText, { color: colors.primary }]}>
                        {deviceTypesLoading ? 'Loading…' : 'Retry'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
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
                onPress={() => {
                  setEditDatePickerMode(null);
                  setEditingTicket(null);
                }}
                style={[styles.modalButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSaveTicket()}
                disabled={updateTicket.isPending || isSavingSignOff}
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
              >
                {updateTicket.isPending || isSavingSignOff ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>
                    {['solved', 'closed'].includes(editStatus) ? 'Complete & Save' : 'Save Changes'}
                  </Text>
                )}
              </Pressable>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={Platform.OS === 'ios' && editDatePickerMode !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setEditDatePickerMode(null)}
      >
        <View style={[styles.signatureModalOverlay, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={[styles.datePickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editDatePickerMode === 'date' ? 'Booking date' : 'Booking time'}
            </Text>
            {editDatePickerMode ? (
              <DateTimePicker
                value={editDatePickerDraft}
                mode={editDatePickerMode}
                display="spinner"
                onChange={handleEditDatePickerChange}
                is24Hour
                style={styles.iosDateTimePicker}
              />
            ) : null}
            <View style={styles.signatureModalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditDatePickerMode(null)}
                style={[styles.signatureModalSecondaryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmEditDatePicker}
                style={[styles.signatureModalPrimaryButton, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>Set {editDatePickerMode}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={signatureModalOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSignatureModalOpen(false)}
      >
        <View style={[styles.signatureModalOverlay, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={[styles.signatureModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.signatureModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Client sign-off</Text>
                <Text style={[styles.cardText, { color: colors.mutedForeground, marginTop: 4 }]}>
                  {clientSignOffName.trim() ? `Ask ${clientSignOffName.trim()} to sign below.` : 'Ask the client to sign below.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close signature pad"
                onPress={() => setSignatureModalOpen(false)}
                hitSlop={10}
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View
              onLayout={(event) => setSignatureCanvasWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
              onMoveShouldSetResponderCapture={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(event) => {
                const { locationX, locationY } = event.nativeEvent;
                setSignatureDraftStrokes((strokes) => [...strokes, `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`]);
              }}
              onResponderMove={(event) => {
                const { locationX, locationY } = event.nativeEvent;
                setSignatureDraftStrokes((strokes) => {
                  if (!strokes.length) return strokes;
                  const next = [...strokes];
                  next[next.length - 1] += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
                  return next;
                });
              }}
              style={[styles.signatureDrawingPad, { backgroundColor: '#ffffff', borderColor: colors.border }]}
              accessibilityLabel="Client signature drawing area"
            >
              <Svg width="100%" height={SIGNATURE_CANVAS_HEIGHT}>
                {signatureDraftStrokes.map((stroke, index) => (
                  <Path
                    key={index}
                    d={stroke}
                    fill="none"
                    stroke="#111827"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
              {!signatureDraftStrokes.length ? (
                <Text pointerEvents="none" style={[styles.signatureHint, { color: colors.mutedForeground }]}>
                  Sign here
                </Text>
              ) : null}
            </View>
            <Text style={[styles.attachmentMeta, { color: colors.mutedForeground }]}>
              Signing confirms the job was completed.
            </Text>
            <View style={styles.signatureModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear client signature"
                onPress={() => setSignatureDraftStrokes([])}
                disabled={!signatureDraftStrokes.length}
                style={[styles.signatureModalSecondaryButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: signatureDraftStrokes.length ? colors.foreground : colors.mutedForeground }]}>
                  Clear
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use this client signature"
                onPress={acceptClientSignature}
                disabled={!signatureDraftStrokes.some((stroke) => stroke.includes(' L '))}
                style={[
                  styles.signatureModalPrimaryButton,
                  { backgroundColor: colors.primary },
                  !signatureDraftStrokes.some((stroke) => stroke.includes(' L ')) && styles.disabled,
                ]}
              >
                <Text style={[styles.modalButtonText, { color: colors.primaryForeground }]}>Use signature</Text>
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
            setEditTemplateValues((current) => ({ ...current, [scannerTarget.key]: value }));
          }
          setScannerTarget(null);
        }}
      />
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
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 8, paddingRight: 4 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexShrink: 0 },
  filterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  ticketList: { gap: 10 },
  ticketCard: { borderRadius: 8, borderWidth: 1, padding: 14 },
  ticketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketId: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  ticketOrg: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center', flex: 1 },
  ticketStatus: { fontFamily: 'Inter_500Medium', fontSize: 11, textTransform: 'capitalize' },
  ticketSubject: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  assetBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  assetBadge: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  assetBadgeLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.5 },
  assetBadgeValue: { fontFamily: 'Inter_700Bold', fontSize: 11 },
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
  siteLocationButton: { marginTop: 11, gap: 5 },
  siteAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  siteAddressText: { flex: 1 },
  siteMapHint: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  mapModalContainer: { flex: 1 },
  mapModalHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mapAddressBlock: { paddingHorizontal: 20, paddingVertical: 12, gap: 4 },
  mapWebView: { flex: 1, backgroundColor: '#f3f4f6' },
  mapLoading: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
  mapLookupWarning: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginHorizontal: 20, marginBottom: 8, borderRadius: 8 },
  mapWebFallback: { flex: 1, borderWidth: 1, margin: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  mapModalFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  navigationButton: { minHeight: 50, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  attachments: { gap: 7, marginTop: 11 },
  pendingAttachmentList: { gap: 7, marginTop: 8 },
  pendingAttachmentRow: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  imagePreviewButton: { minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, marginBottom: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  imagePreviewText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  attachmentRow: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentInfo: { flex: 1 },
  attachmentName: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  attachmentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 2 },
  signOffCard: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 10 },
  signedNotice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingPickerButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingPickerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
  clearBookingButton: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  signaturePreview: { height: 96, borderWidth: 1, borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
  signaturePrompt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signaturePromptText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  signatureHint: { position: 'absolute', left: 0, right: 0, top: SIGNATURE_CANVAS_HEIGHT / 2 - 9, textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 14 },
  signatureModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', justifyContent: 'center', paddingHorizontal: 20 },
  signatureModalCard: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  signatureModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  signatureDrawingPad: { height: SIGNATURE_CANVAS_HEIGHT, borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  signatureModalActions: { flexDirection: 'row', gap: 10 },
  signatureModalSecondaryButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  signatureModalPrimaryButton: { flex: 2, minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  datePickerCard: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderRadius: 14, padding: 16, gap: 14 },
  iosDateTimePicker: { alignSelf: 'stretch' },
  imagePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', justifyContent: 'center', padding: 20 },
  imagePreviewModal: { maxHeight: '82%', borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  imagePreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePreviewTitle: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  previewImage: { width: '100%', height: 420 },
  stockUsageList: { gap: 7 },
  stockUsageRow: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stockUsageTrailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stockUsageActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  stockQuantityInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontFamily: 'Inter_400Regular', fontSize: 14 },
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
  templateAccordion: { borderBottomWidth: StyleSheet.hairlineWidth },
  templateAccordionHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, paddingHorizontal: 2 },
  templateAccordionHeading: { flex: 1, gap: 3 },
  templateAccordionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  templateAccordionSummary: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  templateAccordionFields: { gap: 12, paddingBottom: 12, paddingTop: 4 },
  scannableInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scannableInput: { flex: 1 },
  scanButton: { minHeight: 46, minWidth: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  scanButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  selectTrigger: { minHeight: 46, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selectTriggerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 },
  dropdown: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 },
  dropdownOptions: { maxHeight: 180 },
  dropdownOption: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  dropdownOptionText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  dropdownMessage: { padding: 12, fontFamily: 'Inter_400Regular', fontSize: 12 },
  deviceTypeErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { color: '#D64545', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 4 },
  horizontalScrollRow: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalButton: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});