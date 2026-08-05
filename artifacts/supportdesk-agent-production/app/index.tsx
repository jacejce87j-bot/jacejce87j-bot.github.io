import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function IndexScreen() {
  const colors = useColors();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    router.replace(isSignedIn ? '/(tabs)' : '/(auth)/sign-in');
  }, [isLoaded, isSignedIn]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <Text style={styles.markText}>S</Text>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>SupportDesk</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Agent workspace</Text>
      {!isLoaded && <ActivityIndicator color={colors.primary} style={styles.spinner} />}
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