import { useRef, type ReactNode } from "react";
import { CloseIcon, UploadIcon, UserIcon } from "./icons";

interface UploadCardProps {
  previewUrl: string | null;
  title: string;
  description: ReactNode;
  accept?: string;
  onFile: (file: File) => void;
  onClear?: () => void;
  variant?: "profile" | "logo";
}

export function UploadCard({ previewUrl, title, description, accept = "image/*", onFile, onClear, variant = "profile" }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`registration-upload registration-upload--${variant}`}>
      <div className="registration-upload__preview">
        <div className="registration-upload__media">
          {previewUrl ? <img src={previewUrl} alt="Pré-visualização" /> : variant === "profile" ? <UserIcon /> : <span className="registration-upload__logo-fallback">⌂</span>}
        </div>
        {previewUrl && onClear && (
          <button type="button" className="registration-upload__remove" onClick={onClear} aria-label="Remover imagem"><CloseIcon /></button>
        )}
      </div>
      <div className="registration-upload__copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button type="button" className="registration-upload__button" onClick={() => inputRef.current?.click()}>
        <UploadIcon /> Upload
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
