const RN = require('react-native');
const mocks = require('react-native-gesture-handler/src/mocks/mocks');

module.exports = {
  ...mocks,
  TouchableOpacity: RN.TouchableOpacity,
  Pressable: RN.Pressable,
};
