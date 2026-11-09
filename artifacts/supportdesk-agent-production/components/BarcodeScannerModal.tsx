import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

const BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
  'pdf417',
  'aztec',
  'datamatrix',
];

export function isScannableTemplateField(key: string, label = '') {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedLabel = label.toLowerCase();
  return ['vin', 'deviceid', 'trackingimei', 'imei', 'serialnumber', 'serial'].includes(normalizedKey)
    || /\b(vin|imei|serial number|serial no|device id|asset id)\b/.test(normalizedLabel);
}

type Props = {
  visible: boolean;
  fieldLabel: string;
  onClose: () => void;
  onScanned: (value: string) => void;
};

export function BarcodeScannerModal({ visible, fieldLabel, onClose, onScanned }: Props) {
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);

  useEffect(() => {
    if (visible) hasScanned.current = false;
  }, [visible]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (hasScanned.current || !result.data.trim()) return;
    hasScanned.current = true;
    onScanned(result.data.trim());
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: colors.foreground }]}>Scan {fieldLabel}</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Align a QR code or barcode inside the frame.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close barcode scanner"
            onPress={onClose}
            hitSlop={10}
            style={styles.closeButton}
          >
            <Feather name="x" size={23} color={colors.foreground} />
          </Pressable>
        </View>

        {permission?.granted ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={hasScanned.current ? undefined : handleBarcodeScanned}
            >
              <View pointerEvents="none" style={styles.scanFrameContainer}>
                <View style={styles.scanFrame} />
              </View>
            </CameraView>
            <Text style={[styles.hint, { color: colors.foreground }]}>
              Keep the barcode steady and well lit.
            </Text>
          </View>
        ) : (
          <View style={styles.permissionContent}>
            {!permission ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={[styles.permissionText, { color: colors.foreground }]}>
              {!permission
                ? 'Checking camera permission…'
                : permission.canAskAgain
                  ? 'Camera access is needed to scan a barcode.'
                  : 'Camera access is disabled. Enable it in your device settings to scan.'}
            </Text>
            {permission?.canAskAgain ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void requestPermission()}
                style={[styles.permissionButton, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.permissionButtonText, { color: colors.primaryForeground }]}>Allow camera access</Text>
              </Pressable>
            ) : permission ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void Linking.openSettings()}
                style={[styles.permissionButton, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.permissionButtonText, { color: colors.primaryForeground }]}>Open settings</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { flex: 1, gap: 4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cameraContainer: { flex: 1, padding: 18, gap: 14 },
  camera: { flex: 1, overflow: 'hidden', borderRadius: 12 },
  scanFrameContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: '82%', height: 180, borderWidth: 3, borderColor: '#ffffff', borderRadius: 16 },
  hint: { textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 13, paddingBottom: 8 },
  permissionContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28 },
  permissionText: { maxWidth: 360, textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 },
  permissionButton: { minHeight: 48, borderRadius: 8, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  permissionButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
