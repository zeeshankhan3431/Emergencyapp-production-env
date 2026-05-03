const fs = require('fs');
const path = require('path');

/**
 * @react-native-voice/voice ships an old Android build.gradle using jcenter
 * and old AGP settings. Patch it for RN 0.84 / AGP 8+ compatibility.
 */
const target = path.join(
  __dirname,
  '../node_modules/@react-native-voice/voice/android/build.gradle',
);

const patched = `
apply plugin: "com.android.library"

android {
    namespace "com.wenkesj.voice"
    compileSdk rootProject.ext.compileSdkVersion

    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation fileTree(dir: "libs", include: ["*.jar"])
    testImplementation "junit:junit:4.13.2"
    implementation "androidx.appcompat:appcompat:1.6.1"
    implementation "com.facebook.react:react-android"
}
`;

if (!fs.existsSync(target)) {
  console.warn('[patch-voice] Skip — @react-native-voice/voice android/build.gradle not found.');
  process.exit(0);
}

fs.writeFileSync(target, patched.trim() + '\n');
console.log('✅ @react-native-voice/voice build.gradle patched for AGP 8 / RN 0.84');
