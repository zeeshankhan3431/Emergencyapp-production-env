import React from "react";
import { View, Text, StyleSheet } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { COLORS } from "../theme/colors";

const EmergencyActiveScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚨 Emergency Active</Text>
      <Text style={styles.subtitle}>
        Help is being notified...
      </Text>

      <PrimaryButton
        title="End Emergency"
        backgroundColor={COLORS.success}
        onPress={() => navigation.popToTop()}
      />
    </View>
  );
};

export default EmergencyActiveScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.white,
    marginBottom: 30,
  },
});
