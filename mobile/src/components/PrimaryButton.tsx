//import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { COLORS } from "../theme/colors";
interface Props {
  title: string;
  onPress: () => void;
  backgroundColor?: string;
}

const PrimaryButton: React.FC<Props> = ({
  title,
  onPress,
  backgroundColor,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: backgroundColor || COLORS.primary },
      ]}
      onPress={onPress}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
};

export default PrimaryButton;

const styles = StyleSheet.create({
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginVertical: 10,
  },
  text: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "bold",
  },
});
