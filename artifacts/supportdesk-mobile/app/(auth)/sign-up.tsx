import React, { useState } from 'react';
import { useAuth, useSignUp } from '@clerk/expo';
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
} from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    setMessage('');
    const result = await signUp.password({ emailAddress: email.trim(), password });
    if (result.error) {
      setMessage(result.error.message || 'Unable to create account');
      return;
    }
    const codeResult = await signUp.verifications.sendEmailCode();
    if (codeResult.error) setMessage(codeResult.error.message || 'Unable to send verification code');
    else setSentCode(true);
  };

  const verify = async () => {
    setMessage('');
    const result = await signUp.verifications.verifyEmailCode({ code });
    if (result.error) {
      setMessage(result.error.message || 'Invalid verification code');
      return;
    }
    if (signUp.status === 'complete') {
      await signUp.finalize({ navigate: () => router.replace('/(tabs)') });
    }
  };

  if (isSignedIn) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{sentCode ? 'Check your inbox.' : 'Create your account.'}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {sentCode ? `We sent a verification code to ${email}.` : 'Join your team’s focused ticket workspace.'}
          </Text>
          {!sentCode ? (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>Work email</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor={colors.mutedForeground} />
              <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.mutedForeground} />
              <Pressable onPress={submit} disabled={!email || !password || fetchStatus === 'fetching'} style={[styles.button, { backgroundColor: colors.primary }, (!email || !password) && styles.disabled]}>
                {fetchStatus === 'fetching' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.foreground }]}>Verification code</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" placeholderTextColor={colors.mutedForeground} />
              <Pressable onPress={verify} disabled={!code || fetchStatus === 'fetching'} style={[styles.button, { backgroundColor: colors.primary }, !code && styles.disabled]}>
                {fetchStatus === 'fetching' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify email</Text>}
              </Pressable>
              <Pressable onPress={() => signUp.verifications.sendEmailCode()}><Text style={[styles.resend, { color: colors.primary }]}>Send a new code</Text></Pressable>
            </>
          )}
          {!!message && <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text>}
          {!!errors?.fields?.emailAddress?.message && !message && <Text style={[styles.error, { color: colors.destructive }]}>{errors.fields.emailAddress.message}</Text>}
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>Already have an account? <Link href="/sign-in" style={{ color: colors.primary, fontWeight: '700' }}>Sign in</Link></Text>
          <Text style={[styles.captcha, { color: colors.mutedForeground }]}>Protected by Clerk verification</Text>
          <Text nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2.2 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, letterSpacing: -0.8, marginTop: 12 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginBottom: 28, marginTop: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 8, marginTop: 12 },
  input: { borderRadius: 10, borderWidth: 1, fontFamily: 'Inter_400Regular', fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  button: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 52, marginTop: 22 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  resend: { fontFamily: 'Inter_600SemiBold', marginTop: 20, textAlign: 'center' },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 12 },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 30, textAlign: 'center' },
  captcha: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 18, textAlign: 'center' },
  disabled: { opacity: 0.5 },
});