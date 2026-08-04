import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useListMobileTickets } from '@workspace/api-client-react';
import type { Ticket } from '@workspace/api-client-react';
import { ProfileHeader } from './_layout';
import { useColors } from '@/hooks/useColors';

const filters = [
  { label: 'All', value: undefined },
  { label: 'Open', value: 'open' as const },
  { label: 'Pending', value: 'pending' as const },
  { label: 'Solved', value: 'solved' as const },
];

function priorityColor(priority: Ticket['priority'], colors: ReturnType<typeof useColors>) {
  if (priority === 'urgent') return colors.destructive;
  if (priority === 'high') return '#d97706';
  if (priority === 'low') return colors.mutedForeground;
  return colors.primary;
}

function statusLabel(status: Ticket['status']) {
  return status.replace('_', ' ');
}

function TicketCard({ ticket, onPress }: { ticket: Ticket; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.ticketCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.cardTopline}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor(ticket.priority, colors) }]} />
        <Text style={[styles.priority, { color: priorityColor(ticket.priority, colors) }]}>
          {ticket.priority}
        </Text>
        <Text style={[styles.ticketNumber, { color: colors.mutedForeground }]}>#{ticket.id}</Text>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
      <Text numberOfLines={2} style={[styles.subject, { color: colors.foreground }]}>
        {ticket.subject}
      </Text>
      <Text numberOfLines={2} style={[styles.description, { color: colors.mutedForeground }]}>
        {ticket.description || 'No description provided'}
      </Text>
      <View style={styles.cardFooter}>
        <View style={[styles.statusPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.statusText, { color: colors.foreground }]}>{statusLabel(ticket.status)}</Text>
        </View>
        <Text style={[styles.updated, { color: colors.mutedForeground }]}>
          {new Date(ticket.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    </Pressable>
  );
}

export default function QueueScreen() {
  const colors = useColors();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>(undefined);
  const query = useListMobileTickets(filter ? { status: filter } : undefined);
  const tickets = useMemo(() => query.data?.data ?? [], [query.data?.data]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ProfileHeader />
      <FlatList
        data={tickets}
        keyExtractor={(ticket) => String(ticket.id)}
        renderItem={({ item }) => (
          <TicketCard ticket={item} onPress={() => router.push(`/ticket/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching}
            onRefresh={() => query.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.headingRow}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>WORKSPACE</Text>
                <Text style={[styles.heading, { color: colors.foreground }]}>My queue</Text>
              </View>
              <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.countText, { color: colors.primary }]}>{query.data?.total ?? 0}</Text>
              </View>
            </View>
            <View style={styles.filterRow}>
              {filters.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => setFilter(item.value)}
                  style={[
                    styles.filter,
                    { backgroundColor: filter === item.value ? colors.primary : colors.card, borderColor: filter === item.value ? colors.primary : colors.border },
                  ]}
                >
                  <Text style={[styles.filterText, { color: filter === item.value ? '#fff' : colors.mutedForeground }]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {query.isLoading && (
              <View style={styles.state}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            {query.isError && !query.isLoading && (
              <View style={styles.state}>
                <Feather name="wifi-off" size={24} color={colors.mutedForeground} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Couldn’t load your queue.</Text>
                <Pressable onPress={() => query.refetch()}><Text style={[styles.retry, { color: colors.primary }]}>Try again</Text></Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !query.isLoading && !query.isError ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}>
                <Feather name="check" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>You’re all caught up</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No assigned tickets match this filter.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: 20, paddingBottom: 110 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: -0.8, marginTop: 5 },
  countBadge: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filter: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'capitalize' },
  ticketCard: { borderRadius: 14, borderWidth: 1, marginBottom: 12, padding: 16 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  cardTopline: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  priorityDot: { borderRadius: 4, height: 8, width: 8 },
  priority: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase' },
  ticketNumber: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12 },
  subject: { fontFamily: 'Inter_700Bold', fontSize: 17, lineHeight: 23, marginTop: 12 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 6 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  statusPill: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'capitalize' },
  updated: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 34 },
  stateText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  retry: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 54 },
  emptyIcon: { alignItems: 'center', borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 16 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8, textAlign: 'center' },
});