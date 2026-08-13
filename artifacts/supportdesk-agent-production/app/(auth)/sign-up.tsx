import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { getProductionApiBaseUrl } from '@/components/ProductionApiProvider';
import { configureNativeApiTransport } from '@workspace/api-client-react';
import { tokenStorage } from '@/lib/storage';

export default function SignUpScreen() {
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
      const targetUrl = `${baseUrl}/api/auth/register`;

      const response = await fetch(targetUrl, {
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

      // Guard against HTML error responses (e.g. 404, 500, Vite dev server SPA fallbacks)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const rawText = await response.text();
        console.error('Non-JSON server response:', rawText);
        throw new Error(`Server returned HTML/Text (HTTP ${response.status}). Check backend route /api/auth/register.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Registration failed.');
      }

      // Automatically store JWT token and enter app if returned, else route to sign-in
      if (data.token) {
        await tokenStorage.setItem('userToken', data.token);
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
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
    } catch (err: any) {
      console.error('Sign-up error:', err);
      setErrorMessage(err.message || 'An error occurred during registration.');
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
        <View style={[styles.mark, { backgroundColor: colors.primary }]}>
          <Text style={styles.markText}>S</Text>
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK AGENT</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Create an account for Orion Tracking agents.
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
            placeholder="Create a password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            textContentType="newPassword"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>

        <AuthButton
          label="Create account"
          loading={isLoading}
          disabled={!emailAddress.trim() || !password}
          onPress={handleSubmit}
          colors={colors}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already have an account?</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
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
  mark: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  markText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 26 },
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