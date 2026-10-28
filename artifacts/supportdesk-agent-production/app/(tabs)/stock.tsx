import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';
import { fetchWithFallback } from '@/lib/api';

type StockItem = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  quantityOnHand: number;
  allocatedToFieldAgents: number;
};

type FieldAgent = {
  id: number;
  name: string;
  inventory: {
    stockItemId: number;
    stockItemName: string;
    unit: string;
    quantityOnHand: number;
  }[];
};

async function getToken() {
  return (globalThis as any).__AUTH_TOKEN__ ?? (await AsyncStorage.getItem('userToken')) ?? '';
}

export default function StockScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<StockItem[]>([]);
  const [fieldAgents, setFieldAgents] = useState<FieldAgent[]>([]);
  const [canAllocate, setCanAllocate] = useState(false);
  const [selectedFieldAgentId, setSelectedFieldAgentId] = useState<number | null>(null);
  const [selectedInventoryAgentId, setSelectedInventoryAgentId] = useState<number | null>(null);
  const [isInventoryDropdownOpen, setIsInventoryDropdownOpen] = useState(false);
  const [selectedStockItemId, setSelectedStockItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [isLoading, setIsLoading] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = getProductionApiBaseUrl();

  const loadStock = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      const [stockResponse, agentsResponse, userResponse] = await Promise.all([
        fetchWithFallback('/api/stock', { headers }),
        fetchWithFallback('/api/stock/field-agents', { headers }),
        fetchWithFallback('/api/auth/user', { headers }),
      ]);
      const [stockPayload, agentsPayload, userPayload] = await Promise.all([
        stockResponse.json().catch(() => ({})),
        agentsResponse.json().catch(() => ({})),
        userResponse.json().catch(() => ({})),
      ]);
      if (!stockResponse.ok || !agentsResponse.ok || !userResponse.ok) {
        throw new Error(
          stockPayload.error || agentsPayload.error || userPayload.error || 'Unable to load stock.',
        );
      }
      setItems(stockPayload.data ?? []);
      setFieldAgents(agentsPayload.data ?? []);
      setSelectedInventoryAgentId((current) =>
        agentsPayload.data?.some((agent: FieldAgent) => agent.id === current)
          ? current
          : agentsPayload.data?.[0]?.id ?? null,
      );
      const role = String(userPayload.user?.role ?? '').toLowerCase();
      setCanAllocate(role === 'admin' || role === 'supervisor');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load stock.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStock();
    }, [baseUrl, loadStock]),
  );

  const selectedAgent = fieldAgents.find((agent) => agent.id === selectedFieldAgentId) ?? null;
  const selectedInventoryAgent = fieldAgents.find((agent) => agent.id === selectedInventoryAgentId) ?? null;
  const availableItems = selectedAgent
    ? items.filter((item) => item.quantityOnHand > 0)
    : [];

  const transferStock = async () => {
    const requestedQuantity = Number(quantity);
    if (
      !selectedFieldAgentId ||
      !selectedStockItemId ||
      !Number.isSafeInteger(requestedQuantity) ||
      requestedQuantity < 1
    ) {
      Alert.alert('Check allocation', 'Select a Field Agent and stock item, and enter a positive quantity.');
      return;
    }

    const item = items.find((stockItem) => stockItem.id === selectedStockItemId);
    if (!item || requestedQuantity > item.quantityOnHand) {
      Alert.alert('Insufficient Orion Stock', 'The requested quantity exceeds the available stockroom balance.');
      return;
    }

    setIsTransferring(true);
    try {
      const token = await getToken();
      const response = await fetchWithFallback('/api/stock/transfers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          fieldAgentId: selectedFieldAgentId,
          stockItemId: selectedStockItemId,
          quantity: requestedQuantity,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to allocate stock.');

      setQuantity('1');
      await loadStock();
      Alert.alert(
        'Stock allocated',
        `Transferred ${requestedQuantity} ${item.unit} of ${item.name} to ${selectedAgent?.name ?? 'the Field Agent'}.`,
      );
    } catch (transferError) {
      Alert.alert(
        'Could not allocate stock',
        transferError instanceof Error ? transferError.message : 'Please try again.',
      );
    } finally {
      setIsTransferring(false);
    }
  };

  const chipStyle = (selected: boolean) => [
    styles.chip,
    {
      borderColor: selected ? colors.primary : colors.border,
      backgroundColor: selected ? colors.primary : colors.card,
    },
  ];

  const chipTextStyle = (selected: boolean) => [
    styles.chipText,
    { color: selected ? colors.primaryForeground : colors.foreground },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 110 },
        ]}
        bottomOffset={30}
        keyboardDismissMode="interactive"
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Stock</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Orion Stock and Field Agent balances
            </Text>
          </View>
          <Pressable
            onPress={() => void loadStock()}
            accessibilityRole="button"
            accessibilityLabel="Refresh stock"
            style={[styles.refreshButton, { borderColor: colors.border }]}
          >
            <Feather name="refresh-cw" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
            <Text style={[styles.bodyText, { color: colors.destructive }]}>{error}</Text>
            <Pressable onPress={() => void loadStock()}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Loading stock…</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Allocate stock from Orion Stock</Text>
              {canAllocate ? (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Field Agent</Text>
                  {fieldAgents.length ? (
                    <View style={styles.chipList}>
                      {fieldAgents.map((agent) => (
                        <Pressable
                          key={agent.id}
                          onPress={() => {
                            setSelectedFieldAgentId(agent.id);
                            setSelectedStockItemId(null);
                          }}
                          style={chipStyle(selectedFieldAgentId === agent.id)}
                        >
                          <Text style={chipTextStyle(selectedFieldAgentId === agent.id)}>{agent.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                      No Field Agents have been added. Add them from the web Stock page.
                    </Text>
                  )}

                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Stock item</Text>
                  {selectedAgent && availableItems.length ? (
                    <View style={styles.chipList}>
                      {availableItems.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => setSelectedStockItemId(item.id)}
                          style={chipStyle(selectedStockItemId === item.id)}
                        >
                          <Text style={chipTextStyle(selectedStockItemId === item.id)}>
                            {item.name} · {item.quantityOnHand} {item.unit} in Orion Stock
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                      {selectedAgent
                        ? 'No stock is currently available in Orion Stock.'
                        : 'Select a Field Agent to choose stock for allocation.'}
                    </Text>
                  )}

                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Quantity</Text>
                  <View style={styles.transferRow}>
                    <TextInput
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="number-pad"
                      accessibilityLabel="Quantity to allocate"
                      style={[
                        styles.quantityInput,
                        { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    />
                    <Pressable
                      onPress={() => void transferStock()}
                      disabled={
                        isTransferring ||
                        !selectedFieldAgentId ||
                        !selectedStockItemId ||
                        !Number.isSafeInteger(Number(quantity)) ||
                        Number(quantity) < 1
                      }
                      style={[
                        styles.primaryButton,
                        { backgroundColor: colors.primary },
                        (isTransferring || !selectedFieldAgentId || !selectedStockItemId) && styles.disabled,
                      ]}
                    >
                      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                        {isTransferring ? 'Transferring…' : 'Allocate stock'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                  Stock allocation is available to administrators and supervisors.
                </Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Orion Stock</Text>
              {items.length ? items.map((item) => (
                <View key={item.id} style={[styles.stockRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
                    {item.sku ? <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>SKU {item.sku}</Text> : null}
                  </View>
                  <Text style={[styles.balance, { color: colors.foreground }]}>
                    {item.quantityOnHand} {item.unit}
                  </Text>
                </View>
              )) : <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No stock items found.</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Field Agent stock</Text>
              {fieldAgents.length ? (
                <>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Field Agent</Text>
                  <Pressable
                    onPress={() => setIsInventoryDropdownOpen((open) => !open)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isInventoryDropdownOpen }}
                    style={[
                      styles.dropdownTrigger,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.dropdownValue, { color: selectedInventoryAgent ? colors.foreground : colors.mutedForeground }]}>
                      {selectedInventoryAgent?.name ?? 'Select Field Agent'}
                    </Text>
                    <Feather
                      name={isInventoryDropdownOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                  {isInventoryDropdownOpen ? (
                    <View style={[styles.dropdownList, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      {fieldAgents.map((agent) => (
                        <Pressable
                          key={agent.id}
                          onPress={() => {
                            setSelectedInventoryAgentId(agent.id);
                            setIsInventoryDropdownOpen(false);
                          }}
                          style={[styles.dropdownOption, { borderBottomColor: colors.border }]}
                        >
                          <Text style={[styles.bodyText, { color: colors.foreground }]}>{agent.name}</Text>
                          {agent.id === selectedInventoryAgentId
                            ? <Feather name="check" size={18} color={colors.primary} />
                            : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {selectedInventoryAgent ? (
                    selectedInventoryAgent.inventory.length ? (
                      selectedInventoryAgent.inventory.map((balance) => (
                        <View key={balance.stockItemId} style={[styles.agentBalance, { borderTopColor: colors.border }]}>
                          <Text style={[styles.bodyText, { color: colors.foreground }]}>{balance.stockItemName}</Text>
                          <Text style={[styles.balance, { color: colors.foreground }]}>
                            {balance.quantityOnHand} {balance.unit}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                        No stock allocated to {selectedInventoryAgent.name}.
                      </Text>
                    )
                  ) : null}
                </>
              ) : <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>No Field Agents found.</Text>}
            </View>
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 4 },
  refreshButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  loading: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 2 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 },
  bodyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, justifyContent: 'center' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  transferRow: { flexDirection: 'row', gap: 10 },
  quantityInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 16 },
  primaryButton: { minHeight: 48, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  disabled: { opacity: 0.5 },
  stockRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 2 },
  balance: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  dropdownTrigger: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValue: { fontFamily: 'Inter_400Regular', fontSize: 15 },
  dropdownList: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  dropdownOption: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  agentBalance: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
