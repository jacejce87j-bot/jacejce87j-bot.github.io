import { useClerk, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { getListTicketsQueryKey, useListTickets } from '@workspace/api-client-react';

export default function AgentHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useClerk();
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a new ticket"
          onPress={() => router.push('/new-ticket')}
          style={({ pressed }) => [styles.createButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
        >
          <Feather name="plus" size={18} color={colors.primaryForeground} />
          <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>Create ticket</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My queue</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
            {ticketsQuery.data?.total ?? 0} total
          </Text>
        </View>
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 18, borderTopColor: colors.border }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
  createButton: {
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
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
    paddingHorizontal: 22,
    paddingTop: 14,
    gap: 12,
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
});
