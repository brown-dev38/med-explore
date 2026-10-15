"use client";

import { ROLES, type RoleName } from "@/lib/permissions";

export function UserRoleSelector({ name, value, onChange, disabled = false }: {
  name: string;
  value: string;
  onChange: (role: RoleName) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">บทบาท (เลือกได้ 1 บทบาท)</legend>
      <div className="flex flex-wrap gap-2">
        {Object.values(ROLES).map((role) => (
          <label key={role} className="cursor-pointer">
            <input type="radio" name={name} value={role} checked={value === role}
              onChange={() => onChange(role)} required className="peer sr-only" />
            <span className="inline-flex items-center rounded-lg border border-input px-3 py-2 text-sm font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              {role}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
