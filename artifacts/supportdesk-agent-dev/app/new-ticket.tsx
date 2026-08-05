import { useAuth } from '@clerk/expo';
import {
  getListTicketsQueryKey,
  TicketInput,
  useCreateTicket,
} from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

const PRIORITIES: TicketInput['priority'][] = ['low', 'normal', 'high', 'urgent'];
const TYPES: TicketInput['type'][] = ['question', 'incident', 'problem', 'task'];
const CHANNELS: TicketInput['channel'][] = ['web', 'email', 'chat', 'phone', 'api'];

export default function NewTicketScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketInput['priority']>('normal');
  const [type, setType] = useState<TicketInput['type']>('question');
  const [channel, setChannel] = useState<TicketInput['channel']>('web');
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState<number | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/(auth)/sign-in');
  }, [isLoaded, isSignedIn]);

  const createTicket = useCreateTicket({
    mutation: {
      onSuccess: async (ticket) => {
        await queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() });
        setCreatedId(ticket.id);
      },
      onError: (requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Ticket could not be created.');
      },
    },
  });

  if (!isLoaded || !isSignedIn) {
    if (isLoaded && !isSignedIn) {
      return (
        <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>Sign in required</Text>
          <Text style={[styles.successText, { color: colors.mutedForeground }]}>
            Sign in to create a ticket in the development workspace.
          </Text>
          <Pressable
            onPress={() => router.replace('/(auth)/sign-in')}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Go to sign in</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.successTitle, styles.authLoadingTitle, { color: colors.foreground }]}>
          Preparing your workspace
        </Text>
        <Text style={[styles.successText, { color: colors.mutedForeground }]}>
          Checking your development sign-in securely…
        </Text>
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          style={[styles.button, { backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.buttonText, { color: colors.secondaryForeground }]}>
            Back to sign in
          </Text>
        </Pressable>
      </View>
    );
  }

  if (createdId !== null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <View style={[styles.successIcon, { backgroundColor: colors.accent }]}>
          <Text style={[styles.successIconText, { color: colors.primary }]}>✓</Text>
        </View>
        <Text style={[styles.successTitle, { color: colors.foreground }]}>Ticket created</Text>
        <Text style={[styles.successText, { color: colors.mutedForeground }]}>
          Ticket #{createdId} is now in the development workspace.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Return to my queue</Text>
        </Pressable>
      </View>
    );
  }

  const canSubmit = subject.trim().length > 0 && !createTicket.isPending;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: insets.bottom + (Platform.OS === 'web' ? 102 : 84),
      }}
      bottomOffset={30}
      keyboardDismissMode="interactive"
    >
      <View style={styles.container}>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.primary }]}>‹ Back to queue</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>DEVELOPMENT WORKSPACE</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Create a ticket</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Capture a customer request for the SupportDesk team.
        </Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Subject *</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of the issue"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          autoCapitalize="sentences"
        />

        <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Add the important details"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.card, borderColor: colors.input, color: colors.foreground }]}
          multiline
          textAlignVertical="top"
        />

        <ChoiceGroup label="Priority" values={PRIORITIES} value={priority} onChange={setPriority} colors={colors} />
        <ChoiceGroup label="Type" values={TYPES} value={type} onChange={setType} colors={colors} />
        <ChoiceGroup label="Channel" values={CHANNELS} value={channel} onChange={setChannel} colors={colors} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          disabled={!canSubmit}
          onPress={() => {
            setError('');
            createTicket.mutate({
              data: {
                subject: subject.trim(),
                description: description.trim() || undefined,
                status: 'open',
                priority,
                type,
                channel,
              },
            });
          }}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (!canSubmit || createTicket.isPending) && styles.disabled, pressed && styles.pressed]}
        >
          {createTicket.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Create ticket</Text>}
        </Pressable>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

function ChoiceGroup<T extends string>({
  label,
  values,
  value,
  onChange,
  colors,
}: {
  label: string;
  values: T[];
  value: T;
  onChange: (value: T) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.choices}>
        {values.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.choice,
              { backgroundColor: colors.card, borderColor: colors.border },
              value === option && { backgroundColor: colors.accent, borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.choiceText, { color: value === option ? colors.accentForeground : colors.mutedForeground }]}>
              {option.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { paddingHorizontal: 22 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 22 },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1, marginBottom: 9 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.6 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 24 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 9, marginTop: 13 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15 },
  multilineInput: { minHeight: 120, paddingTop: 14 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'capitalize' },
  error: { color: '#D64545', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 18 },
  button: { minHeight: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  successIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  successIconText: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  successTitle: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  authLoadingTitle: { marginTop: 18 },
  successText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 8 },
});