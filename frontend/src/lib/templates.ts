export type TemplateId = "usecase";

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  defaultDocumentLabel: string;
  description: string;
}

export const TEMPLATE_REGISTRY: Record<TemplateId, TemplateMeta> = {
  usecase: {
    id: "usecase",
    label: "Customer Case Study",
    defaultDocumentLabel: "CUSTOMER CASE STUDY",
    description:
      "A branded customer case study PDF with hero image, summary sections, narrative, and diagram.",
  },
};

export function getTemplate(id: TemplateId): TemplateMeta {
  return TEMPLATE_REGISTRY[id];
}

export interface TemplateGalleryEntry {
  id: string;
  label: string;
  description: string;
  available: boolean;
}

export const TEMPLATE_GALLERY: readonly TemplateGalleryEntry[] = [
  {
    id: "usecase",
    label: "Customer Case Study",
    description: "Branded hero, narrative, and diagram.",
    available: true,
  },
  {
    id: "usecase-brief",
    label: "Use Case Brief",
    description: "Short one-pager.",
    available: false,
  },
  {
    id: "article",
    label: "Article Report",
    description: "Long-form article layout.",
    available: false,
  },
  {
    id: "memo",
    label: "Executive Memo",
    description: "Internal memo format.",
    available: false,
  },
  {
    id: "word",
    label: "Text to Word",
    description: ".docx export.",
    available: false,
  },
  {
    id: "pdf-report",
    label: "Text to PDF Report",
    description: "Plain PDF report.",
    available: false,
  },
];
