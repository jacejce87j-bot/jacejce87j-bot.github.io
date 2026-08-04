import React from 'react';
import { Redirect, Stack, Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function TabsLayout() {
  const colors = useColors();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  if (!isSignedIn) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 82,
          paddingBottom: 18,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My queue',
          tabBarIcon: ({ color, size }) => <Feather name="inbox" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: 'New ticket',
          tabBarIcon: ({ color, size }) => <Feather name="plus-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

export function ProfileHeader() {
  const colors = useColors();
  const { signOut } = useAuth();
  const { user } = useUser();

  return (
    <View style={[styles.profileHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {(user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0] || 'S').toUpperCase()}
        </Text>
      </View>
      <View style={styles.profileCopy}>
        <Text style={[styles.profileName, { color: colors.foreground }]}>
          {user?.firstName || user?.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Support agent'}
        </Text>
        <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
          {user?.emailAddresses[0]?.emailAddress}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Sign out"
        onPress={() => signOut()}
        style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}
      >
        <Feather name="log-out" size={19} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  profileHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15 },
  avatar: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  profileCopy: { flex: 1, marginLeft: 12 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  profileEmail: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  signOut: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
});