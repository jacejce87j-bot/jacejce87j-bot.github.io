import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { user } = useUser();
  const email = user?.emailAddresses[0]?.emailAddress || '';
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'Support agent';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>ACCOUNT</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>Profile</Text>
        <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{name[0].toUpperCase()}</Text>
          </View>
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>{email}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.accountRow}>
            <Feather name="shield" size={17} color={colors.primary} />
            <Text style={[styles.accountLabel, { color: colors.foreground }]}>SupportDesk agent</Text>
          </View>
        </View>
        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [styles.signOut, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.8 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: -0.8, marginTop: 5 },
  profileCard: { alignItems: 'center', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 24 },
  avatar: { alignItems: 'center', borderRadius: 34, height: 68, justifyContent: 'center', width: 68 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 14 },
  email: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5 },
  divider: { height: 1, marginVertical: 22, width: '100%' },
  accountRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  accountLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  signOut: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 16, minHeight: 52 },
  signOutText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});