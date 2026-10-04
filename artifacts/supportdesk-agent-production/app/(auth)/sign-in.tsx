import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';
import { configureNativeApiTransport } from '@workspace/api-client-react';

// ✅ Universal storage helper (works on both Native & Web)
import { tokenStorage } from '@/lib/storage';

const OrionLogo = require('../../assets/images/orion-logo.png');

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const baseUrl = getProductionApiBaseUrl();

  const handleSubmit = async () => {
    if (!emailAddress.trim() || !password) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          email: emailAddress.trim().toLowerCase(),
          password: password,
        }),
      });

      // Defensive check for non-JSON responses (e.g. 404 HTML server pages)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const rawText = await response.text();
        console.error('Non-JSON server response:', rawText);
        throw new Error(`Server returned HTTP ${response.status}. Verify route /api/auth/login.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Login failed. Please check your credentials.');
      }

      // Store JWT Token securely (uses localStorage on Web, SecureStore on Mobile)
      if (data.token) {
        await tokenStorage.setItem('userToken', data.token);

        // Ensure shared API client also gets the token (web + native)
        try {
          configureNativeApiTransport(baseUrl, data.token);
        } catch (e) {
          try {
            if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
              window.localStorage.setItem('auth_token', data.token);
            }
          } catch (e) {}
          try {
            (globalThis as any).__AUTH_TOKEN__ = data.token;
          } catch (e) {}
        }

        // Additional debug: ensure global token is set and log it so we can verify in Metro logs
        try {
          (globalThis as any).__AUTH_TOKEN__ = data.token;
          console.log('[Auth] Stored token on globalThis and local storage');
        } catch (e) {
          console.warn('[Auth] Failed to set global token', e);
        }

        // Navigate to main workspace upon successful login
        router.replace('/(tabs)');
      } else {
        throw new Error('No authentication token received.');
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setErrorMessage(err.message || 'An error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }}
      bottomOffset={28}
      keyboardDismissMode="interactive"
    >
      <View style={styles.container}>
        <Image
          source={OrionLogo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Orion Tracking Logo"
        />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK AGENT</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Sign in to your SupportDesk workspace.
        </Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: colors.foreground }]}>Email address</Text>
          <TextInput
            style={inputStyle}
            value={emailAddress}
            onChangeText={setEmailAddress}
            placeholder="you@oriontracking.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />

          <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            textContentType="password"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>

        <AuthButton
          label="Sign in"
          loading={isLoading}
          disabled={!emailAddress.trim() || !password}
          onPress={handleSubmit}
          colors={colors}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>New to SupportDesk?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function AuthButton({
  label,
  loading,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primary },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, alignItems: 'stretch' },
  logo: { width: 48, height: 48, borderRadius: 12, marginBottom: 22 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1, marginBottom: 9 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.6 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 32 },
  form: { gap: 9 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  error: { color: '#D64545', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 6 },
  button: { minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 22 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});