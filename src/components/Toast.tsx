import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

export function Toast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <View style={styles.toast}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    backgroundColor: theme.colors.ink,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14
  },
  text: {
    color: theme.colors.textInverse,
    fontSize: 14
  }
});
