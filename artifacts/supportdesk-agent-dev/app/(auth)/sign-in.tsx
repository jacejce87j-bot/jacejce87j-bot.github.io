import { useSignIn } from '@clerk/expo';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const isLoading = fetchStatus === 'fetching';

  const finishSignIn = async () => {
    await signIn.finalize({
      navigate: () => router.replace('/(tabs)'),
    });
  };

  const handleSubmit = async () => {
    const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
    if (error) return;
    if (signIn.status === 'complete') {
      await finishSignIn();
    } else if (signIn.status === 'needs_client_trust') {
      const emailCodeFactor = signIn.supportedSecondFactors.find((factor) => factor.strategy === 'email_code');
      if (emailCodeFactor) await signIn.mfa.sendEmailCode();
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (signIn.status === 'complete') await finishSignIn();
  };

  const inputStyle = [styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }];
  const isVerification = signIn.status === 'needs_client_trust';

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }}
      bottomOffset={28}
      keyboardDismissMode="interactive"
    >
      <View style={styles.container}>
        <View style={[styles.mark, { backgroundColor: colors.primary }]}><Text style={styles.markText}>S</Text></View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>SUPPORTDESK AGENT</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Sign in to your development workspace.
        </Text>

        {isVerification ? (
          <>
            <Text style={[styles.formTitle, { color: colors.foreground }]}>Verify your sign-in</Text>
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>Enter the code sent to your email.</Text>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              autoFocus
            />
            <AuthButton label="Verify code" loading={isLoading} disabled={!code.trim()} onPress={handleVerify} colors={colors} />
            <Pressable onPress={() => signIn.reset()} style={styles.textButton}>
              <Text style={[styles.link, { color: colors.primary }]}>Start over</Text>
            </Pressable>
          </>
        ) : (
          <>
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
              {errors.fields.identifier && <Text style={styles.error}>{errors.fields.identifier.message}</Text>}
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
              {errors.fields.password && <Text style={styles.error}>{errors.fields.password.message}</Text>}
            </View>
            <AuthButton label="Sign in" loading={isLoading} disabled={!emailAddress.trim() || !password} onPress={handleSubmit} colors={colors} />
            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>New to SupportDesk?</Text>
              <Link href="/(auth)/sign-up" asChild>
                <Pressable><Text style={[styles.link, { color: colors.primary }]}>Create an account</Text></Pressable>
              </Link>
            </View>
          </>
        )}
        <View style={[styles.devBadge, { backgroundColor: colors.secondary }]}>
          <View style={styles.devDot} />
          <Text style={[styles.devText, { color: colors.secondaryForeground }]}>Development environment only</Text>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function AuthButton({ label, loading, disabled, onPress, colors }: { label: string; loading: boolean; disabled: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (disabled || loading) && styles.disabled, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text>}
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
  formTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17, marginBottom: 6 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  form: { gap: 9 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  error: { color: '#D64545', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: -3 },
  button: { minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 22 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  textButton: { alignItems: 'center', marginTop: 16 },
  devBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8, marginTop: 34 },
  devDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D99027' },
  devText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
});