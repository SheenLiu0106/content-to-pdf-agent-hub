import type { UseCase } from "@shared/useCaseSchema";
import type { TemplateId } from "../lib/templates";
import EditableCaseStudyPreview from "./EditableCaseStudyPreview";
import EditableArticleReportPreview from "./EditableArticleReportPreview";
import EditableExecutiveMemoPreview from "./EditableExecutiveMemoPreview";

interface Props {
  content: UseCase;
  onChange: (next: UseCase) => void;
  documentLabel: string;
  templateId: TemplateId;
}

// Dispatcher: the underlying schema is still UseCase, but each template
// gets its own editable preview so the field labels and grouping match the
// selected document type. Switching templates immediately rebinds the form.
export default function EditableUseCasePreview({
  content,
  onChange,
  documentLabel,
  templateId,
}: Props) {
  switch (templateId) {
    case "article_report":
      return (
        <EditableArticleReportPreview
          content={content}
          onChange={onChange}
          documentLabel={documentLabel}
        />
      );
    case "executive_memo":
      return (
        <EditableExecutiveMemoPreview
          content={content}
          onChange={onChange}
          documentLabel={documentLabel}
        />
      );
    case "usecase":
    default:
      return (
        <EditableCaseStudyPreview
          content={content}
          onChange={onChange}
          documentLabel={documentLabel}
        />
      );
  }
}
