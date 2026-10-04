import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';
import { tokenStorage } from '@/lib/storage';
import { configureNativeApiTransport } from '@workspace/api-client-react';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onError: (message: string) => void;
};

export function GoogleAuthButton({ onError }: Props) {
  const colors = useColors();
  const [isLoading, setIsLoading] = useState(false);
  const baseUrl = getProductionApiBaseUrl();

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
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'supportdesk',
        path: 'auth/callback',
      });

      const authUrl = `${baseUrl}/api/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const parsedUrl = new URL(result.url);
        const token = parsedUrl.searchParams.get('token');
        const errorParam = parsedUrl.searchParams.get('error');

        if (errorParam) {
          throw new Error(decodeURIComponent(errorParam));
        }

        if (token) {
          await tokenStorage.setItem('userToken', token);
          try {
            configureNativeApiTransport(baseUrl, token);
          } catch (e) {
            try {
              if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
                window.localStorage.setItem('auth_token', token);
              }
            } catch (e) {}
            try {
              (globalThis as any).__AUTH_TOKEN__ = token;
            } catch (e) {}
          }
          router.replace('/(tabs)');
        } else {
          throw new Error('Authentication succeeded but no access token was returned.');
        }
      } else if (result.type === 'dismiss' || result.type === 'cancel') {
        setIsLoading(false);
      } else {
        throw new Error('Google authentication was cancelled or failed.');
      }
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
