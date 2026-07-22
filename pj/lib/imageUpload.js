export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGES_PER_REQ = 10;

// 이미지 업로드 유효성(순수 함수). 파일 1개 기준으로 판정한다.
export function validateImageUpload({ contentType, byteSize, currentCount }) {
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return { ok: false, error: '지원하지 않는 이미지 형식입니다.' };
  }
  if (byteSize > MAX_IMAGE_BYTES) {
    return { ok: false, error: '이미지 크기는 10MB 이하여야 합니다.' };
  }
  if (currentCount >= MAX_IMAGES_PER_REQ) {
    return { ok: false, error: '이미지는 최대 10개까지 첨부할 수 있습니다.' };
  }
  return { ok: true };
}
