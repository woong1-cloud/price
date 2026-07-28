import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireBrandAccess } from '@/lib/permissions';
import { errorResponse, ApiError } from '@/lib/apiError';
import { TIER_RANK } from '@/lib/tiers';
import { DONE_STATUS, MERGED_STATUS } from '@/lib/statuses';
import { toSignedImageList } from '@/lib/storage';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const supabase = getSupabaseAdmin();
    const { data: requirement, error: reqError } = await supabase
      .from('requirements')
      .select(
        '*, requester:team_members!requirements_requester_fkey(id, name), ' +
          'assignee:team_members!requirements_assignee_fkey(id, name), ' +
          'category:brand_categories(id, category_name)'
      )
      .eq('id', id)
      .maybeSingle();
    if (reqError) throw reqError;
    if (!requirement) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');

    const { tier, isGlobalAdmin } = await requireBrandAccess(requirement.brand_id, '4차');
    const canSeeConfidential = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
    if (requirement.is_confidential && !canSeeConfidential) {
      throw new ApiError(403, '비공개 요구사항은 조회할 수 없습니다.');
    }

    const { data: history, error: histError } = await supabase
      .from('change_logs')
      .select('id, changed_by, change_type, field_name, old_value, new_value, comment, created_at, ' +
        'changer:team_members!change_logs_changed_by_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (histError) throw histError;

    const { data: duplicates, error: dupError } = await supabase
      .from('duplicate_links')
      .select('id, linked_note, requester:team_members!duplicate_links_linked_requester_fkey(id, name)')
      .eq('requirement_id', id)
      .order('created_at', { ascending: true });
    if (dupError) throw dupError;

    let mergedInto = null;
    if (requirement.status === MERGED_STATUS) {
      const { data: link, error: linkError } = await supabase
        .from('duplicate_links')
        .select('target:requirements!duplicate_links_requirement_id_fkey(id, title)')
        .like('linked_note', `% (#${id})`)
        .limit(1)
        .maybeSingle();
      if (linkError) throw linkError;
      if (link?.target) mergedInto = { id: link.target.id, title: link.target.title };
    }

    const { data: imageRows, error: imgError } = await supabase
      .from('requirement_images')
      .select('id, storage_path, content_type, sort_order')
      .eq('requirement_id', id)
      .order('sort_order', { ascending: true });
    if (imgError) throw imgError;
    const images = await toSignedImageList(imageRows);

    return Response.json({ requirement, history, duplicates, mergedInto, images });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { brandId, title, priority, urgency, category, asIs, toBe, note, isConfidential } = body;
    if (!brandId) throw new ApiError(400, 'brandId가 필요합니다.');

    const { memberId, tier, isGlobalAdmin } = await requireBrandAccess(brandId, '4차');

    const supabase = getSupabaseAdmin();
    const { data: current, error: curError } = await supabase
      .from('requirements')
      .select('id, brand_id, status, requester')
      .eq('id', id)
      .maybeSingle();
    if (curError) throw curError;
    if (!current) throw new ApiError(404, '요구사항을 찾을 수 없습니다.');
    if (current.brand_id !== brandId) throw new ApiError(403, '브랜드가 일치하지 않습니다.');
    if (current.status === DONE_STATUS || current.status === MERGED_STATUS) {
      throw new ApiError(400, '완료되었거나 병합된 요구사항은 수정할 수 없습니다.');
    }

    const canProcess = isGlobalAdmin || TIER_RANK[tier] >= TIER_RANK['3차'];
    const isOwner = current.requester === memberId;
    if (!canProcess && !isOwner) {
      throw new ApiError(403, '수정 권한이 없습니다.');
    }

    const FIELD_LABELS = {
      title: '제목',
      priority: '우선순위',
      urgency: '긴급도',
      category: '카테고리',
      asIs: 'As-Is',
      toBe: 'To-Be',
      note: '비고',
      isConfidential: '비공개여부',
    };
    const updates = {};
    const changedFields = [];
    if (title !== undefined) {
      if (!title.trim()) throw new ApiError(400, '제목은 필수입니다.');
      updates.title = title.trim();
      changedFields.push(FIELD_LABELS.title);
    }
    if (priority !== undefined) {
      updates.priority = priority || null;
      changedFields.push(FIELD_LABELS.priority);
    }
    if (urgency !== undefined) {
      updates.urgency = urgency || null;
      changedFields.push(FIELD_LABELS.urgency);
    }
    if (category !== undefined) {
      updates.category = category || null;
      changedFields.push(FIELD_LABELS.category);
    }
    if (asIs !== undefined) {
      updates.as_is = asIs || null;
      changedFields.push(FIELD_LABELS.asIs);
    }
    if (toBe !== undefined) {
      updates.to_be = toBe || null;
      changedFields.push(FIELD_LABELS.toBe);
    }
    if (note !== undefined) {
      updates.note = note || null;
      changedFields.push(FIELD_LABELS.note);
    }
    if (isConfidential !== undefined && canProcess) {
      updates.is_confidential = Boolean(isConfidential);
      changedFields.push(FIELD_LABELS.isConfidential);
    }

    if (Object.keys(updates).length === 0) throw new ApiError(400, '수정할 필드가 없습니다.');

    updates.updated_at = new Date().toISOString();
    const { data, error: updError } = await supabase
      .from('requirements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (updError) throw updError;

    const { error: logError } = await supabase.from('change_logs').insert({
      requirement_id: id,
      brand_id: brandId,
      changed_by: memberId,
      change_type: '내용수정',
      comment: `${changedFields.join(', ')} 수정`,
    });
    if (logError) throw logError;

    return Response.json({ requirement: data });
  } catch (error) {
    return errorResponse(error);
  }
}
