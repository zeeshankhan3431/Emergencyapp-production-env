import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'emergency_evidence_consent_v1';

export interface EvidenceConsent {
  granted: boolean;
  grantedAt: number | null;
  version: string;
}

const DEFAULT_CONSENT: EvidenceConsent = {
  granted: false,
  grantedAt: null,
  version: 'v1',
};

class ConsentService {
  async getEvidenceConsent(): Promise<EvidenceConsent> {
    try {
      const raw = await AsyncStorage.getItem(CONSENT_KEY);
      if (!raw) return DEFAULT_CONSENT;
      const parsed = JSON.parse(raw) as EvidenceConsent;
      return {
        granted: !!parsed.granted,
        grantedAt: parsed.grantedAt ?? null,
        version: parsed.version ?? 'v1',
      };
    } catch {
      return DEFAULT_CONSENT;
    }
  }

  async setEvidenceConsent(granted: boolean): Promise<EvidenceConsent> {
    const value: EvidenceConsent = {
      granted,
      grantedAt: granted ? Date.now() : null,
      version: 'v1',
    };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    return value;
  }
}

export const consentService = new ConsentService();
