import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultProfileTextPreferences,
  loadProfileAvatar,
  loadProfileTextPreferences,
  resetProfileAvatar,
  saveProfileAvatar,
  saveProfileTextPreferences,
} from './profile-preferences';

afterEach(async () => {
  localStorage.clear();
  await resetProfileAvatar();
});

describe('profile preferences', () => {
  it('persists profile text and trims saved values', () => {
    saveProfileTextPreferences({ ledgerName: '  我的账本  ', signature: '  今天也要记账  ' });

    expect(loadProfileTextPreferences()).toEqual({
      ledgerName: '我的账本',
      signature: '今天也要记账',
    });
  });

  it('falls back to the default profile when stored text is invalid', () => {
    localStorage.setItem('seabreeze-profile-preferences', '{invalid');
    expect(loadProfileTextPreferences()).toEqual(defaultProfileTextPreferences);
  });

  it('persists, loads, and restores a custom avatar', async () => {
    const image = new File(['custom-avatar'], 'avatar.png', { type: 'image/png' });

    const dataUrl = await saveProfileAvatar(image);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await loadProfileAvatar()).toBe(dataUrl);

    await resetProfileAvatar();
    expect(await loadProfileAvatar()).toBeUndefined();
  });

  it('rejects unsupported avatar files', async () => {
    const document = new File(['not-an-image'], 'notes.txt', { type: 'text/plain' });
    await expect(saveProfileAvatar(document)).rejects.toThrow('请选择 PNG、JPG 或 WebP 图片');
  });
});
