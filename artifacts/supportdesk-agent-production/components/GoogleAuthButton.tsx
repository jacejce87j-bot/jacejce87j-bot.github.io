import { useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onError: (message: string) => void;
};

export function GoogleAuthButton({ onError }: Props) {
  const colors = useColors();
  const { startSSOFlow } = useSSO();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    onError('');

    try {
      // Keep this identical to Clerk Expo's documented default. Clerk only
      // includes rotating_token_nonce for an allowed SSO callback URL.
      const redirectUrl = AuthSession.makeRedirectUri({
        path: 'sso-callback',
      });
      const { createdSessionId, setActive, signIn, signUp } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl,
      });

      if (!createdSessionId || !setActive) {
        const missingFields = [...(signUp?.missingFields ?? [])];
        if (missingFields.length > 0) {
          onError(`Google sign-in needs: ${missingFields.join(', ')}.`);
        } else {
          onError('Google sign-in needs one more account step before it can continue.');
        }
        return;
      }

      await setActive({
        session: createdSessionId,
        navigate: async ({ session }) => {
          if (session?.currentTask) {
            onError('Google sign-in needs one more account step before continuing.');
            return;
          }
          router.replace('/(tabs)');
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign-in could not be completed.';
      onError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      disabled={isLoading}
      onPress={() => void handleGoogleAuth()}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
        isLoading && styles.disabled,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.foreground} />
      ) : (
        <>
          <Text style={[styles.googleMark, { color: colors.primary }]}>G</Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  googleMark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.6,
  },
});