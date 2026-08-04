import React, { useCallback, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuth, useSSO, useSignIn } from '@clerk/expo';
import { Link, Redirect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => void WebBrowser.coolDownAsync();
  }, []);

  const submit = async () => {
    setMessage('');
    const result = await signIn.password({
      emailAddress: email.trim(),
      password,
    });
    if (result.error) {
      setMessage(result.error.message || 'Unable to sign in');
      return;
    }
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: () => router.replace('/(tabs)'),
      });
    } else {
      setMessage('This account needs an additional verification step.');
    }
  };

  const signInWithGoogle = useCallback(async () => {
    try {
      setMessage('');
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({
          scheme: 'supportdesk-mobile',
        }),
      });
      if (createdSessionId) {
        await setActive?.({ session: createdSessionId });
        router.replace('/(tabs)');
      } else {
        setMessage('Google sign-in needs one more step. Please try email sign-in.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed');
    }
  }, [router, startSSOFlow]);

  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <Text style={styles.brandMarkText}>S</Text>
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Your queue, in hand.</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to work assigned tickets wherever you are.
          </Text>

          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.foreground }]}>Work email</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@company.com"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
              placeholderTextColor={colors.mutedForeground}
            />
            {!!message && <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text>}
            {!!errors?.fields?.identifier?.message && !message && (
              <Text style={[styles.error, { color: colors.destructive }]}>{errors.fields.identifier.message}</Text>
            )}
            <Pressable
              onPress={submit}
              disabled={!email || !password || fetchStatus === 'fetching'}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary },
                (!email || !password || fetchStatus === 'fetching') && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {fetchStatus === 'fetching' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
            </Pressable>
            <Pressable
              onPress={signInWithGoogle}
              style={({ pressed }) => [
                styles.googleButton,
                { borderColor: colors.border, backgroundColor: colors.card },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.googleButtonText, { color: colors.foreground }]}>Continue with Google</Text>
            </Pressable>
          </View>
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>
            New to SupportDesk? <Link href="/sign-up" style={{ color: colors.primary, fontWeight: '700' }}>Create an account</Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  brandMark: { alignItems: 'center', borderRadius: 14, height: 52, justifyContent: 'center', marginBottom: 18, width: 52 },
  brandMarkText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 28 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2.2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1, marginTop: 10 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 10, maxWidth: 330 },
  form: { gap: 10, marginTop: 34 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
  input: { borderRadius: 10, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 52, marginTop: 10 },
  primaryButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  googleButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 52, marginTop: 2 },
  googleButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 26, textAlign: 'center' },
});