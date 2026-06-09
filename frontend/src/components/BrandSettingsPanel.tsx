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
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none ring-1 ring-inset ring-slate-200 transition-all duration-300 ease-spring placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-400/50"
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
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-xl bg-white p-1.5 ring-1 ring-inset ring-slate-200 transition-all duration-300 ease-spring focus-within:ring-2 focus-within:ring-indigo-400/50">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 border-0 bg-transparent px-1 font-mono text-xs uppercase text-slate-700 outline-none"
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
    <section className="space-y-4 rounded-[1.5rem] bg-white/70 p-5 shadow-soft-sm ring-1 ring-slate-900/[0.04] backdrop-blur-sm">
      <div>
        <h3 className="text-[13px] font-bold tracking-tight text-slate-900">Brand</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
          These values appear in the PDF footer and theme.
        </p>
      </div>
      {fields}
    </section>
  );
}
