import { FileImage } from "lucide-react";
import { getDocumentFileType } from "@/lib/schemas/documents";

interface DocumentIconProps {
  fileName: string;
  className?: string;
}

/// Icône PDF — forme de fichier avec coin plié et label "PDF"
function FilePdf({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a1 1 0 0 0 1 1h3" />
      <text x="12" y="16.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6" fontWeight="700" fontFamily="system-ui, sans-serif">PDF</text>
    </svg>
  );
}

/// Icône contextuelle : image ou PDF selon l'extension du fichier
export function DocumentIcon({ fileName, className = "size-5 text-muted-foreground" }: DocumentIconProps) {
  const type = getDocumentFileType(fileName);
  if (type === "image") return <FileImage className={className} />;
  return <FilePdf className={className} />;
}
