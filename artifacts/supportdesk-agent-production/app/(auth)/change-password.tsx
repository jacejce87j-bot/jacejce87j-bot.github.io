import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { tokenStorage } from '@/lib/storage';
import { fetchWithFallback } from '@/lib/api';
import { getGetCurrentAuthUserQueryKey } from '@workspace/api-client-react';

export default function ChangePasswordScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (newPassword.length < 12) {
      Alert.alert('Password too short', 'Your new password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Enter the same new password in both fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await tokenStorage.getItem('userToken');
      if (!token) throw new Error('Your session has expired. Sign in again.');

      const response = await fetchWithFallback('/api/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Password update failed (HTTP ${response.status}).`);
      }

      const userResponse = await fetchWithFallback('/api/auth/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const userResult = await userResponse.json().catch(() => ({}));
      if (!userResponse.ok || userResult?.user?.mustChangePassword) {
        throw new Error('The new password was saved, but your account status could not be refreshed. Please sign in again.');
      }

      queryClient.setQueryData(getGetCurrentAuthUserQueryKey(), userResult);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        'Password update failed',
        error instanceof Error ? error.message : 'Unable to update your password.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      bottomOffset={24}
    >
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.foreground }]}>Update your password</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          For your account security, choose a new password of at least 12 characters before continuing.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Current password</Text>
        <TextInput
          style={inputStyle}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          editable={!isSubmitting}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>New password</Text>
        <TextInput
          style={inputStyle}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          editable={!isSubmitting}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Confirm new password</Text>
        <TextInput
          style={inputStyle}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          editable={!isSubmitting}
        />

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            (isSubmitting || !currentPassword || !newPassword || !confirmPassword) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Update password</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  container: { paddingHorizontal: 24, gap: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, marginBottom: 4 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginBottom: 12 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 8, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
  button: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
