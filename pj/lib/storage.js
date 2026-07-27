import 'server-only';
import { getSupabaseAdmin } from './supabaseAdmin';

export const IMAGE_BUCKET = 'requirement-images';

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function extForContentType(contentType) {
  return EXT_BY_TYPE[contentType] ?? 'bin';
}

// 파일 하나를 업로드하고 저장 경로를 반환한다.
export async function uploadImage({ brandId, requirementId, buffer, contentType }) {
  const supabase = getSupabaseAdmin();
  const ext = extForContentType(contentType);
  const path = `${brandId}/${requirementId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, buffer, { contentType });
  if (error) throw error;
  return path;
}

export async function removeImageObject(path) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}

// storage_path 배열 → { path: signedUrl } 맵. 짧은 TTL(기본 300초).
export async function signImagePaths(paths, expiresIn = 300) {
  if (!paths.length) return {};
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

// requirement_images 행 배열 → 클라이언트용 { id, signedUrl, content_type, sort_order }.
export async function toSignedImageList(rows) {
  const paths = (rows ?? []).map((r) => r.storage_path);
  const signed = await signImagePaths(paths);
  return (rows ?? []).map((r) => ({
    id: r.id,
    signedUrl: signed[r.storage_path] ?? null,
    content_type: r.content_type,
    sort_order: r.sort_order,
  }));
}
