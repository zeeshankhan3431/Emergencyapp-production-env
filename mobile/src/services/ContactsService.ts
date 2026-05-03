/**
 * ContactsService.ts
 * Manages emergency contacts stored locally via AsyncStorage.
 * Each contact has a name and phone number.
 * Contacts are notified via SMS when an emergency is escalated.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'emergency_contacts_v1';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string; // E.164 format recommended, e.g. +12125551234
}

class ContactsService {
  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned.includes('+')) return cleaned;
    const digitsOnly = cleaned.replace(/\+/g, '');
    return cleaned.startsWith('+') ? `+${digitsOnly}` : digitsOnly;
  }

  private ensureValidPhone(phone: string): string {
    const normalized = this.normalizePhone(phone);
    const digitsCount = normalized.replace(/\D/g, '').length;
    if (digitsCount < 7) {
      throw new Error('Invalid phone number');
    }
    return normalized;
  }

  async getAll(): Promise<EmergencyContact[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async save(contacts: EmergencyContact[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }

  async add(name: string, phone: string): Promise<EmergencyContact> {
    const contacts = await this.getAll();
    const normalizedPhone = this.ensureValidPhone(phone.trim());
    const contact: EmergencyContact = {
      id: `c_${Date.now()}`,
      name: name.trim(),
      phone: normalizedPhone,
    };
    contacts.push(contact);
    await this.save(contacts);
    return contact;
  }

  async remove(id: string): Promise<void> {
    const contacts = await this.getAll();
    await this.save(contacts.filter(c => c.id !== id));
  }

  async update(id: string, name: string, phone: string): Promise<void> {
    const contacts = await this.getAll();
    const idx = contacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      contacts[idx] = { id, name: name.trim(), phone: this.ensureValidPhone(phone.trim()) };
      await this.save(contacts);
    }
  }
}

export const contactsService = new ContactsService();
