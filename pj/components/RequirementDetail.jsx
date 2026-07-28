'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useIdentity } from '@/components/IdentityProvider';
import { canProcess } from '@/lib/tiers';
import { BOARD_STATUSES, DONE_STATUS, MERGED_STATUS } from '@/lib/statuses';
import { ImageDropzone } from '@/components/ImageDropzone';
import { RequirementEditForm } from '@/components/RequirementEditForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString('ko-KR') : '';
}

export function RequirementDetail({ id }) {
  const { identity } = useIdentity();
  const processAllowed = canProcess(identity);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  // loadError: 최초/재조회 실패 — 화면 전체를 대체한다.
  // actionError: 상태·담당자·이미지 조작 실패 — 이미 불러온 화면은 유지한 채 배너로만 보여준다.
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [newFiles, setNewFiles] = useState([]);

  useEffect(() => {
    fetch('/api/team-members')
      .then((res) => res.json())
      .then((d) => setTeamMembers(d.teamMembers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => res.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch(`/api/requirements/${id}`)
      .then((res) => res.json().then((d) => ({ res, d })))
      .then(({ res, d }) => {
        if (!res.ok) throw new Error(d.error ?? '불러오지 못했습니다.');
        setData(d);
        setLoadError('');
      })
      .catch((e) => setLoadError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(status) {
    setActionError('');
    const res = await fetch(`/api/requirements/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId: identity.brandId, status }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '상태 변경 실패');
      return;
    }
    load();
  }

  async function changeAssignee(assignee) {
    setActionError('');
    const res = await fetch(`/api/requirements/${id}/assignee`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId: identity.brandId,
        assignee: assignee === '__none__' ? null : assignee,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '담당자 변경 실패');
      return;
    }
    load();
  }

  async function changeProject(nextProjectId) {
    setActionError('');
    const res = await fetch(`/api/requirements/${id}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: nextProjectId === 'none' ? null : nextProjectId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '프로젝트 변경 실패');
      return;
    }
    load();
  }

  async function uploadNew() {
    if (newFiles.length === 0) return;
    setActionError('');
    const fd = new FormData();
    fd.append('brandId', identity.brandId);
    newFiles.forEach((f) => fd.append('files', f));
    const res = await fetch(`/api/requirements/${id}/images`, { method: 'POST', body: fd });
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '이미지 업로드 실패');
      return;
    }
    setNewFiles([]);
    load();
  }

  async function deleteImage(imageId) {
    if (!window.confirm('이미지를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    setActionError('');
    const res = await fetch(
      `/api/requirements/${id}/images/${imageId}?brandId=${identity.brandId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const d = await res.json();
      setActionError(d.error ?? '이미지 삭제 실패');
      return;
    }
    load();
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!data) return <p className="text-sm text-slate-500">불러오는 중...</p>;

  const { requirement: r, history, duplicates, mergedInto, images } = data;

  const canEdit =
    (processAllowed || r.requester?.id === identity.memberId) &&
    r.status !== DONE_STATUS &&
    r.status !== MERGED_STATUS;
  // canEdit이 false로 바뀌면(예: 편집 중 상태를 완료/중복으로 변경) 편집 폼을 자동으로 닫는다.
  const showEditForm = editing && canEdit;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/requirements" className="text-sm text-slate-500 hover:text-slate-700">
        ← 목록으로
      </Link>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {mergedInto && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          이 요청은{' '}
          <Link href={`/requirements/${mergedInto.id}`} className="text-indigo-600 underline">
            &lsquo;{mergedInto.title}&rsquo;
          </Link>{' '}
          요청에 병합되었습니다.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-900">{r.title}</h1>
            {canEdit && !showEditForm && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-indigo-600 hover:underline"
              >
                수정
              </button>
            )}
          </div>
          {showEditForm ? (
            <RequirementEditForm
              requirement={r}
              canSetConfidential={processAllowed}
              identity={identity}
              onSaved={() => {
                setEditing(false);
                load();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-1 text-sm font-medium text-slate-500">As-Is</h2>
                <p className="whitespace-pre-wrap text-sm text-slate-900">{r.as_is || '-'}</p>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-1 text-sm font-medium text-slate-500">To-Be</h2>
                <p className="whitespace-pre-wrap text-sm text-slate-900">{r.to_be || '-'}</p>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-1 text-sm font-medium text-slate-500">비고</h2>
                <p className="whitespace-pre-wrap text-sm text-slate-900">{r.note || '-'}</p>
              </section>
            </>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-medium text-slate-500">이미지</h2>
            {images.length === 0 && <p className="text-sm text-slate-400">첨부된 이미지가 없습니다.</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="relative">
                  <a href={img.signedUrl} target="_blank" rel="noreferrer">
                    <img
                      src={img.signedUrl}
                      alt=""
                      className="h-20 w-full rounded-md border border-slate-200 object-cover"
                    />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteImage(img.id)}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <ImageDropzone
                files={newFiles}
                onAdd={(added) => setNewFiles((prev) => [...prev, ...added])}
                onRemove={(i) => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
              {newFiles.length > 0 && (
                <button
                  type="button"
                  onClick={uploadNew}
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                >
                  {newFiles.length}개 업로드
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div>
            <p className="text-slate-500">상태</p>
            {processAllowed ? (
              <Select
                items={BOARD_STATUSES.map((s) => ({ value: s, label: s }))}
                value={r.status}
                onValueChange={changeStatus}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-medium text-slate-900">{r.status}</p>
            )}
          </div>
          <div>
            <p className="text-slate-500">담당자</p>
            {processAllowed ? (
              <Select
                items={[
                  { value: '__none__', label: '미지정' },
                  ...teamMembers.map((m) => ({ value: m.id, label: m.name })),
                ]}
                value={r.assignee?.id ?? '__none__'}
                onValueChange={changeAssignee}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">미지정</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-medium text-slate-900">{r.assignee?.name ?? '미지정'}</p>
            )}
          </div>
          <div>
            <p className="text-slate-500">프로젝트</p>
            {processAllowed ? (
              <Select
                items={[
                  { value: 'none', label: '선택 안 함' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={r.project_id ?? 'none'}
                onValueChange={changeProject}
              >
                <SelectTrigger className="mt-1 h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : r.project ? (
              <Link
                href={`/projects/${r.project.id}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {r.project.name}
              </Link>
            ) : (
              <p className="font-medium text-slate-900">-</p>
            )}
          </div>
          <MetaRow label="카테고리" value={r.category?.category_name ?? '-'} />
          <MetaRow label="요청자" value={r.requester?.name ?? '-'} />
          <MetaRow label="요청일" value={r.request_date ?? '-'} />
          <MetaRow label="우선순위" value={r.priority ?? '-'} />
          <MetaRow label="긴급도" value={r.urgency ?? '-'} />
          {r.is_confidential && <p className="text-rose-600">비공개</p>}
        </aside>
      </div>

      {duplicates.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-500">이 요청에 병합된 요청</h2>
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.linked_note} — 요청자 {d.requester?.name ?? '-'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-500">활동</h2>
        {history.length === 0 && <p className="text-sm text-slate-400">기록이 없습니다.</p>}
        <ul className="flex flex-col gap-2 text-sm text-slate-700">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500">
                {(h.changer?.name ?? '?').slice(0, 1)}
              </span>
              <span>
                {h.changer?.name ?? '누군가'}님이{' '}
                {h.change_type === '내용수정' || h.change_type === '중복병합'
                  ? h.comment
                  : `상태를 ${h.old_value}→${h.new_value}로 변경`}
                <span className="text-slate-400"> · {fmt(h.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
