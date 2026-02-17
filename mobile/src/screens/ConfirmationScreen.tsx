import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { COLORS } from "../theme/colors";

const ConfirmationScreen = ({ navigation }: any) => {
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (countdown === 0) {
      navigation.replace("EmergencyActive");
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <View style={styles.container}>
      <Text style={styles.warning}>Emergency will trigger in</Text>
      <Text style={styles.timer}>{countdown}</Text>

      <PrimaryButton
        title="Cancel"
        backgroundColor={COLORS.grey}
        onPress={() => navigation.goBack()}
      />
    </View>
  );
};

export default ConfirmationScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  warning: {
    fontSize: 20,
    marginBottom: 10,
  },
  timer: {
    fontSize: 60,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 40,
  },
});
