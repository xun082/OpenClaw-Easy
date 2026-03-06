/**
 * Kimi (Moonshot) service — client-side key storage only.
 *
 * The key stored here is used by the local skills recommendation feature.
 * For Gateway-level injection, set KIMI_API_KEY inside the config's env section.
 */

const KEY_STORAGE = 'openclaw_kimi_api_key';

export function getKimiApiKey(): string {
  if (typeof localStorage === 'undefined') return '';

  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function saveKimiApiKey(key: string): void {
  if (typeof localStorage === 'undefined') return;

  if (key.trim()) {
    localStorage.setItem(KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(KEY_STORAGE);
  }
}

export function clearKimiApiKey(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY_STORAGE);
}
