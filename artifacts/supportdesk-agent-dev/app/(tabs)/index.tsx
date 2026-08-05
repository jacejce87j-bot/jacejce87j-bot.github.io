import { useClerk, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function AgentHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useClerk();
  const firstName = user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Agent';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
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
              Authentication is connected. Ticket data is the next development slice.
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: '#2FA36B' }]} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My queue</Text>
          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>Coming next</Text>
        </View>
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="inbox" size={22} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tickets loaded yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            This clean development build is ready for the new API boundary.
          </Text>
        </View>
      </View>

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
