import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// T-117: Per-screen error boundary for POS app

interface Props { children: React.ReactNode; screenName?: string; }
interface State { hasError: boolean; error: Error | null; }

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
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>!</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.description}>
            {this.props.screenName ? `The ${this.props.screenName} screen encountered an error.` : 'This screen encountered an error.'}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  icon: { fontSize: 28, fontWeight: '700', color: '#DC2626' },
  title: { fontSize: 18, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  description: { fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 280, marginBottom: 24 },
  button: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#2563EB', borderRadius: 6 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
});
