import { useAuth } from '@clerk/expo';
import { useSignIn, useSignUp } from '@clerk/expo/legacy';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * OAuth callback target for Clerk's Expo SSO flow.
 *
 * Native Android can recreate the route that started the browser flow. In
 * that case the original startSSOFlow promise cannot finish the session, so
 * this route performs Clerk's documented rotating-token recovery itself.
 */
export default function OAuthCallbackScreen() {
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp } = useSignUp();
  const { rotating_token_nonce: nonceParam } =
    useLocalSearchParams<{ rotating_token_nonce?: string | string[] }>();
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(true);
  const hasStarted = useRef(false);
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
    if (!isLoaded || isSignedIn || !signIn || !signUp || !setSignInActive || hasStarted.current) {
      return;
    }

    hasStarted.current = true;
    let cancelled = false;
    const nonce = Array.isArray(nonceParam) ? nonceParam[0] : nonceParam;

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setIsProcessing(false);
        setError('Google sign-in took too long to complete. Please try again.');
      }
    }, 15000);

    const completeNativeSignIn = async () => {
      try {
        if (!nonce) {
          throw new Error(
            'The Google callback did not include the required sign-in token. Please try again.',
          );
        }

        await signIn.reload({ rotatingTokenNonce: nonce });

        if (signIn.firstFactorVerification.status === 'transferable') {
          await signUp.create({ transfer: true });
        }

        const createdSessionId = signUp.createdSessionId ?? signIn.createdSessionId;
        if (!createdSessionId) {
          const missingFields = signUp.missingFields.map(String);
          throw new Error(
            missingFields.length
              ? `Google sign-in needs: ${missingFields.join(', ')}.`
              : 'Google sign-in returned without a completed session. Please try again.',
          );
        }

        await setSignInActive({
          session: createdSessionId,
          navigate: navigateToWorkspace,
        });
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Google sign-in could not be completed. Please try again.',
          );
          setIsProcessing(false);
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    void completeNativeSignIn();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    isLoaded,
    isSignedIn,
    nonceParam,
    setSignInActive,
    signIn,
    signUp,
  ]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {isProcessing && !error ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={[styles.title, { color: colors.foreground }]}>
          {error ? 'Google sign-in could not finish' : 'Completing Google sign-in'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {error || 'Returning to your development workspace…'}
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