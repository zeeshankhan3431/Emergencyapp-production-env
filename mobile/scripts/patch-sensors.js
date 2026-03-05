const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '../node_modules/react-native-sensors/android/build.gradle'
);

const patched = `
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:7.4.2'
    }
}

apply plugin: 'com.android.library'

android {
    compileSdkVersion 34
    buildToolsVersion "34.0.0"
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion 34
    }
}

repositories {
    google()
    mavenCentral()
    maven { url "https://www.jitpack.io" }
}

dependencies {
    implementation 'com.facebook.react:react-native:+'
}
`;

fs.writeFileSync(target, patched.trim());
console.log('✅ react-native-sensors build.gradle patched successfully');
