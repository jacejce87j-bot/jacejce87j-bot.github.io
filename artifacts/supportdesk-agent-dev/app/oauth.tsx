import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';

/**
 * OAuth callback target for Clerk's Expo SSO flow.
 *
 * The active `startSSOFlow` call completes the session and navigates to the
 * agent workspace. This route must exist so Expo Router does not turn the
 * provider callback into its generic not-found screen while that happens.
 */
export default function OAuthCallbackScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Completing Google sign-in
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Returning to your development workspace…
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginTop: 18,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
});