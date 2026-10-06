import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { tokenStorage } from '@/lib/storage';
import { fetchWithFallback } from '@/lib/api';

export default function IndexScreen() {
  const colors = useColors();

  useEffect(() => {
    async function checkAuthAndNavigate() {
      try {
        // 1. Check for stored custom JWT token
        const token = await tokenStorage.getItem('userToken');

        if (token) {
          try {
            const response = await fetchWithFallback('/api/auth/user', {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            if (response.status === 401) {
              router.replace('/(auth)/sign-in');
              return;
            }
            if (response.ok) {
              const body = await response.json();
              if (body?.user?.mustChangePassword) {
                router.replace('/(auth)/change-password');
                return;
              }
            } else {
              console.warn(`Could not check password-change requirement (HTTP ${response.status}).`);
            }
          } catch (error) {
            console.warn('Could not check password-change requirement:', error);
          }

          router.replace('/(tabs)');
        } else {
          // User is unauthenticated -> Go to sign-in screen
          router.replace('/(auth)/sign-in');
        }
      } catch (error) {
        console.error('Failed to read auth token from storage:', error);
        // Fallback to sign-in on error
        router.replace('/(auth)/sign-in');
      }
    }

    void checkAuthAndNavigate();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <Text style={styles.markText}>S</Text>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>SupportDesk</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Agent workspace</Text>
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  markText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 34 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 },
  spinner: { marginTop: 24 },
});