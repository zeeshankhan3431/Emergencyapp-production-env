const fs = require('fs');
const path = require('path');

/**
 * react-native-sensors ships an outdated android/build.gradle (AGP 3.x style).
 * Override with a minimal library config that inherits SDK versions from the
 * React Native root project — no pinned AGP classpath, no obsolete buildToolsVersion.
 */
const target = path.join(
  __dirname,
  '../node_modules/react-native-sensors/android/build.gradle',
);

const patched = `
apply plugin: "com.android.library"

android {
    namespace "com.sensors"
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
    }

    lint {
        abortOnError false
        disable 'InvalidPackage'
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.annotation:annotation:1.7.0")
}
`;

if (!fs.existsSync(target)) {
  console.warn('[patch-sensors] Skip — react-native-sensors android/build.gradle not found (run npm install first).');
  process.exit(0);
}

fs.writeFileSync(target, patched.trim() + '\n');
console.log('✅ react-native-sensors build.gradle patched for AGP 8 / RN 0.84');
