'use client';

import { ImageIcon, Link2, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function AssetPicker({
  id,
  label,
  value,
  onChange,
  recommendedAspectRatio,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  recommendedAspectRatio?: string;
}) {
  const valid = value === null || /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/iu.test(value);
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface-secondary/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="type-field-label">{label}</p>
          <p className="type-help">
            HTTPS image URL
            {recommendedAspectRatio === undefined
              ? ''
              : ` · recommended ${recommendedAspectRatio}`}
          </p>
        </div>
        {value === null ? (
          <Badge variant="outline">No image</Badge>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            <Trash2 size={14} /> Clear
          </Button>
        )}
      </div>
      <Field
        label="Image URL"
        htmlFor={id}
        error={valid ? undefined : 'Use a valid HTTPS URL.'}
      >
        <div className="relative">
          <Link2
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle-foreground"
          />
          <Input
            id={id}
            type="url"
            value={value ?? ''}
            placeholder="https://cdn.example.com/image.png"
            className="pl-9"
            aria-invalid={!valid}
            onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
          />
        </div>
      </Field>
      {value !== null && valid ? (
        <div className="relative grid min-h-32 place-items-center overflow-hidden rounded-md border border-border bg-[linear-gradient(45deg,var(--surface-muted)_25%,transparent_25%),linear-gradient(-45deg,var(--surface-muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--surface-muted)_75%),linear-gradient(-45deg,transparent_75%,var(--surface-muted)_75%)] bg-[length:20px_20px]">
          <img src={value} alt="" className="max-h-52 max-w-full object-contain" />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs font-semibold text-subtle-foreground"
          title="Connect the existing secure upload service before enabling uploads."
        >
          <UploadCloud size={15} /> Upload
        </button>
        <button
          type="button"
          disabled
          className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs font-semibold text-subtle-foreground"
          title="No server asset library is configured."
        >
          <ImageIcon size={15} /> Asset library
        </button>
      </div>
      <p className="type-help">
        Upload and library controls stay disabled until the dashboard is connected to a validated
        image asset service. Arbitrary files are never accepted by this URL field.
      </p>
    </div>
  );
}
