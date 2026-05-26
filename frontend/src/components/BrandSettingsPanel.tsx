import type { PdfRenderConfig } from "@shared/useCaseSchema";

interface Props {
  config: PdfRenderConfig;
  onChange: (next: PdfRenderConfig) => void;
  embedded?: boolean;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-12 cursor-pointer rounded border border-slate-300"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs uppercase shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    </label>
  );
}

export default function BrandSettingsPanel({ config, onChange, embedded = false }: Props) {
  function update<K extends keyof PdfRenderConfig>(key: K, value: PdfRenderConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  const fields = (
    <div className="space-y-3">
      <TextInput
        label="Brand Name"
        value={config.brandName}
        onChange={(v) => update("brandName", v)}
        placeholder="Your Company"
      />

      <TextInput
        label="Website"
        value={config.brandWebsite}
        onChange={(v) => update("brandWebsite", v)}
        placeholder="www.example.com"
      />

      <TextInput
        label="Document Label"
        value={config.documentLabel}
        onChange={(v) => update("documentLabel", v)}
        placeholder="CUSTOMER CASE STUDY"
      />

      <TextInput
        label="Copyright"
        value={config.brandCopyright}
        onChange={(v) => update("brandCopyright", v)}
        placeholder="© 2026 Your Company. All rights reserved."
      />

      <div className="grid grid-cols-2 gap-3">
        <ColorInput
          label="Primary"
          value={config.primaryColor}
          onChange={(v) => update("primaryColor", v)}
        />
        <ColorInput
          label="Accent"
          value={config.accentColor}
          onChange={(v) => update("accentColor", v)}
        />
      </div>
    </div>
  );

  if (embedded) return fields;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-100/60">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Brand</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          These values appear in the PDF footer and theme.
        </p>
      </div>
      {fields}
    </section>
  );
}
