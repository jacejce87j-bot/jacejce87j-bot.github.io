import { useAuth } from '@clerk/expo';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * OAuth callback target for Clerk's Expo SSO flow.
 *
 * Clerk's useSSO() owns the one-time rotating-token exchange. This route must
 * stay passive: attempting another signIn.reload() here consumes the nonce a
 * second time and produces an empty JSON response on Android.
 */
export default function OAuthCallbackScreen() {
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(true);
  const hasNavigated = useRef(false);

  const navigateToWorkspace = () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    router.replace('/(tabs)');
  };

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigateToWorkspace();
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isSignedIn) {
        setIsProcessing(false);
        setError(
          'Google sign-in did not return to the workspace. Please try again.',
        );
      }
    }, 20000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isSignedIn]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {isProcessing && !error ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={[styles.title, { color: colors.foreground }]}>
          {error ? 'Google sign-in could not finish' : 'Completing Google sign-in'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {error || 'Returning to your workspace…'}
        </Text>
        {error ? (
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
              Try Google sign-in again
            </Text>
          </Pressable>
        ) : null}
        <View nativeID="clerk-captcha" />
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
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 24,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});