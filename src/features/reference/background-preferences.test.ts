import { afterEach, describe, expect, it } from 'vitest';
import {
  loadBackgroundOverrides,
  resetBackgroundOverride,
  saveBackgroundOverride,
} from './background-preferences';

afterEach(async () => {
  await resetBackgroundOverride('home');
});

describe('background preferences', () => {
  it('persists and restores a custom background image', async () => {
    const image = new File(['custom-background'], 'home.png', { type: 'image/png' });

    const dataUrl = await saveBackgroundOverride('home', image);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect((await loadBackgroundOverrides()).home).toBe(dataUrl);

    await resetBackgroundOverride('home');
    expect((await loadBackgroundOverrides()).home).toBeUndefined();
  });

  it('rejects unsupported background files', async () => {
    const document = new File(['not-an-image'], 'notes.txt', { type: 'text/plain' });
    await expect(saveBackgroundOverride('home', document))
      .rejects.toThrow('请选择 PNG、JPG 或 WebP 图片');
  });
});
