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
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[7px] border border-hair-strong border-t-[rgba(36,37,34,0.15)] bg-gradient-to-b from-[rgba(237,237,232,0.9)] to-[rgba(255,255,252,0.92)] px-2.5 py-1.5 text-[11.5px] text-ink shadow-sunken outline-none transition-all duration-200 placeholder:text-ink-faint focus:from-white focus:to-white focus:ring-2 focus:ring-ember-500/25"
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
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-[7px] border border-hair-strong bg-white p-1 shadow-sunken transition-all duration-200 focus-within:ring-2 focus-within:ring-ember-500/25">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-9 cursor-pointer rounded-[7px] border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-[6px] [&::-webkit-color-swatch]:border-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 border-0 bg-transparent px-1 font-mono text-xs uppercase text-ink-soft outline-none"
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
    <section className="space-y-4 rounded-[1.5rem] bg-white/70 p-5 shadow-soft-sm ring-1 ring-hair backdrop-blur-sm">
      <div>
        <h3 className="text-[13px] font-bold tracking-tight text-ink">Brand</h3>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
          These values appear in the PDF footer and theme.
        </p>
      </div>
      {fields}
    </section>
  );
}
