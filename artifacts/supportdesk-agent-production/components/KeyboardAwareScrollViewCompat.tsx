import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  ...props
}: Props) {
  if (Platform.OS === 'web') {
    return (
      <ScrollView
        {...props}
        style={[{ flex: 1, width: '100%' }, props.style]}
        contentContainerStyle={[
          { flexGrow: 1 },
          props.contentContainerStyle,
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <KeyboardAwareScrollView
      {...props}
      style={[{ flex: 1, width: '100%' }, props.style]}
      contentContainerStyle={[
        { flexGrow: 1 },
        props.contentContainerStyle,
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
