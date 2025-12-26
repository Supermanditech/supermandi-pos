import React from "react";
import { View, Text, StyleSheet } from "react-native";

const PaymentScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Payment Method</Text>
      <Text style={styles.sub}>Payment screen loaded successfully</Text>
    </View>
  );
};

export default PaymentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8
  },
  sub: {
    fontSize: 14,
    color: "#666"
  }
});
