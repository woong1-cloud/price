import { describe, expect, it } from 'vitest';
import { validateImageUpload, MAX_IMAGE_BYTES, MAX_IMAGES_PER_REQ } from './imageUpload';

const ok = { contentType: 'image/png', byteSize: 1000, currentCount: 0 };

describe('validateImageUpload', () => {
  it('정상 케이스는 ok', () => {
    expect(validateImageUpload(ok)).toEqual({ ok: true });
  });

  it('허용되지 않는 MIME은 거부', () => {
    expect(validateImageUpload({ ...ok, contentType: 'application/pdf' }).ok).toBe(false);
  });

  it('최대 크기 초과는 거부', () => {
    expect(validateImageUpload({ ...ok, byteSize: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
  });

  it('최대 크기 경계값은 허용', () => {
    expect(validateImageUpload({ ...ok, byteSize: MAX_IMAGE_BYTES }).ok).toBe(true);
  });

  it('개수 한도에 도달하면 거부', () => {
    expect(validateImageUpload({ ...ok, currentCount: MAX_IMAGES_PER_REQ }).ok).toBe(false);
  });
});
