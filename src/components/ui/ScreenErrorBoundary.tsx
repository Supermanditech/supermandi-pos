import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance } from 'react-native';
import { lightColors, darkColors } from '../../theme/colors';

// T-117: Per-screen error boundary for POS app
// STG-272: Uses Appearance.getColorScheme() for dark mode (class component cannot use hooks)

interface Props { children: React.ReactNode; screenName?: string; }
interface State { hasError: boolean; error: Error | null; }

function getColors() {
  const isDark = Appearance.getColorScheme() === 'dark';
  return isDark ? darkColors : lightColors;
}

export default class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const c = getColors();
      return (
        <View style={[styles.container, { backgroundColor: c.background }]}>
          <View style={[styles.iconCircle, { backgroundColor: c.errorSoft }]}>
            <Text style={[styles.icon, { color: c.error }]}>!</Text>
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Something went wrong</Text>
          <Text style={[styles.description, { color: c.textTertiary }]}>
            {this.props.screenName ? `The ${this.props.screenName} screen encountered an error.` : 'This screen encountered an error.'}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: c.primary }]}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={[styles.buttonText, { color: c.textInverse }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  icon: { fontSize: 28, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  description: { fontSize: 14, textAlign: 'center', maxWidth: 280, marginBottom: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 6 },
  buttonText: { fontSize: 14, fontWeight: '500' },
});
