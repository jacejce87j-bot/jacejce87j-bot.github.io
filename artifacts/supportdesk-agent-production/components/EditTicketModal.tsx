import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';

interface EditTicketModalProps {
  visible: boolean;
  ticket: {
    id: number;
    subject: string;
    description: string;
    status: string;
    priority: string;
    assigneeId: number | null;
  } | null;
  agents: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSave: (updatedTicket: any) => void;
}

export function EditTicketModal({ visible, ticket, agents, onClose, onSave }: EditTicketModalProps) {
  if (!ticket) return null;

  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [assigneeId, setAssigneeId] = useState<number | null>(ticket.assigneeId);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000';

      const res = await fetch(`${baseUrl}/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          description,
          status,
          priority,
          assigneeId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const updated = await res.json();
      onSave(updated);
      onClose();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message || 'Could not update ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>Edit Ticket #{ticket.id}</Text>

        <Text style={styles.label}>Subject</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} />

        <Text style={styles.label}>Status</Text>
        <View style={styles.row}>
          {['new', 'open', 'pending', 'solved', 'closed'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, status === s && styles.chipActive]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Priority</Text>
        <View style={styles.row}>
          {['low', 'medium', 'high', 'urgent'].map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, priority === p && styles.chipActive]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>{p.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Assignee</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          <TouchableOpacity
            style={[styles.chip, assigneeId === null && styles.chipActive]}
            onPress={() => setAssigneeId(null)}
          >
            <Text style={[styles.chipText, assigneeId === null && styles.chipTextActive]}>Unassigned</Text>
          </TouchableOpacity>
          {agents.map((agent) => (
            <TouchableOpacity
              key={agent.id}
              style={[styles.chip, assigneeId === agent.id && styles.chipActive]}
              onPress={() => setAssigneeId(agent.id)}
            >
              <Text style={[styles.chipText, assigneeId === agent.id && styles.chipTextActive]}>
                {agent.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#FFF' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 6, color: '#475569' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, backgroundColor: '#F8FAFC' },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText: { color: '#FFF', fontWeight: '600' },
});