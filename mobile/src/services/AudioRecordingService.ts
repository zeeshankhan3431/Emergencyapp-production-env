import { NativeModules, Platform } from 'react-native';

class AudioRecordingService {
  private active = false;
  private filePath: string | null = null;

  async start(): Promise<{ recording: boolean; filePath?: string }> {
    if (this.active) return { recording: true, filePath: this.filePath ?? undefined };
    if (Platform.OS !== 'android' || !NativeModules.EmergencyModule?.startEmergencyRecording) {
      return { recording: false };
    }

    const result = await NativeModules.EmergencyModule.startEmergencyRecording();
    this.active = true;
    this.filePath = result?.filePath ?? null;
    return { recording: true, filePath: this.filePath ?? undefined };
  }

  async stop(): Promise<{ recording: boolean; filePath?: string }> {
    if (!this.active) return { recording: false, filePath: this.filePath ?? undefined };
    if (Platform.OS !== 'android' || !NativeModules.EmergencyModule?.stopEmergencyRecording) {
      this.active = false;
      return { recording: false, filePath: this.filePath ?? undefined };
    }

    const result = await NativeModules.EmergencyModule.stopEmergencyRecording();
    this.active = false;
    this.filePath = result?.filePath ?? this.filePath;
    return { recording: false, filePath: this.filePath ?? undefined };
  }

  get isRecording(): boolean {
    return this.active;
  }
}

export const audioRecordingService = new AudioRecordingService();
