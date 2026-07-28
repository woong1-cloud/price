'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PRIORITIES = ['상', '중', '하'];

// props: teamMembers[], categories[], value{assignee,category,priority}, onChange(patch)
export function FilterBar({ teamMembers, categories, projects, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        placeholder="담당자"
        options={teamMembers.map((m) => ({ value: m.id, label: m.name }))}
        current={value.assignee}
        onPick={(v) => onChange({ assignee: v })}
      />
      <FilterSelect
        placeholder="카테고리"
        options={categories.map((c) => ({ value: c.id, label: c.category_name }))}
        current={value.category}
        onPick={(v) => onChange({ category: v })}
      />
      <FilterSelect
        placeholder="우선순위"
        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
        current={value.priority}
        onPick={(v) => onChange({ priority: v })}
      />
      <FilterSelect
        placeholder="프로젝트"
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        current={value.project}
        onPick={(v) => onChange({ project: v })}
      />
      {(value.assignee || value.category || value.priority || value.project) && (
        <button
          type="button"
          onClick={() => onChange({ assignee: '', category: '', priority: '', project: '' })}
          className="text-xs text-slate-500 underline hover:text-slate-700"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}

function FilterSelect({ placeholder, options, current, onPick }) {
  return (
    <Select
      items={options}
      value={current || null}
      onValueChange={onPick}
    >
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
