import { useEffect, useState } from "react";
import fallbackIcon from "../../assets/brand/escala-imob-icon-original.svg";
import type { RegistrationFormState } from "../types";
import { TextAreaField, TextField } from "../components/FormControls";
import { UploadCard } from "../components/UploadCard";

const operationIconPath = "/assets/registration/logo_simples_escala_imob.png";

interface Props {
  value: RegistrationFormState;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onContinue: () => void;
  onSkip: () => void;
}

export function OperationStep({ value, onChange, onContinue, onSkip }: Props) {
  const [iconSource, setIconSource] = useState(operationIconPath);

  useEffect(() => {
    if (!value.operationName && value.companyName.trim()) onChange({ operationName: value.companyName.trim() });
  }, [value.companyName, value.operationName, onChange]);

  return (
    <section className="registration-operation-card">
      <header className="registration-operation-card__header">
        <h2>Configure sua operação</h2>
        <p>Defina o nome, a identidade e a descrição da sua operação para começar a organizar<br className="desktop-only" /> seu trabalho na Escala IMOB. Você poderá editar essas informações depois.</p>
      </header>
      <div className="registration-operation-card__progress"><span /></div>
      <div className="registration-operation-card__body">
        <div className="registration-operation-form">
          <span className="registration-pill">Sua operação</span>
          <p className="registration-operation-form__intro">Organize sua operação, defina um nome e descreva sua atuação. Isso será útil para personalizar sua experiência e estruturar sua equipe no futuro.</p>
          <UploadCard
            variant="logo"
            previewUrl={value.operationLogoPreviewUrl}
            title="Upload de logo"
            description={<>Tamanho recomendado:<br />400 × 400 px, com até<br />10 MB.</>}
            onFile={(file) => {
              if (file.size > 10 * 1024 * 1024) return;
              if (value.operationLogoPreviewUrl) URL.revokeObjectURL(value.operationLogoPreviewUrl);
              onChange({ operationLogoFile: file, operationLogoPreviewUrl: URL.createObjectURL(file) });
            }}
            onClear={() => {
              if (value.operationLogoPreviewUrl) URL.revokeObjectURL(value.operationLogoPreviewUrl);
              onChange({ operationLogoFile: null, operationLogoPreviewUrl: null });
            }}
          />
          <div className="registration-fields registration-fields--compact">
            <TextField id="registration-operation-name" label="Nome da operação" placeholder="Escala IMOB" value={value.operationName} onChange={(e) => onChange({ operationName: e.target.value })} />
            <TextAreaField id="registration-operation-description" label="Descrição" placeholder="Descreva resumidamente sua atuação no mercado imobiliário" value={value.operationDescription} onChange={(e) => onChange({ operationDescription: e.target.value })} rows={5} />
          </div>
          <div className="registration-card__actions registration-card__actions--spread">
            <button className="registration-secondary registration-secondary--small" type="button" onClick={onSkip}>Pular por enquanto</button>
            <button className="registration-primary registration-primary--small" type="button" onClick={onContinue}>Continue</button>
          </div>
        </div>
        <div className="operation-preview" aria-hidden="true">
          <div className="operation-preview__canvas">
            <div className="operation-preview__window">
              <div className="operation-preview__top"><span className="operation-preview__avatar" /><span className="operation-preview__short" /><span className="operation-preview__square" /></div>
              <div className="operation-preview__row"><span /><span /><i /><i /></div>
              <div className="operation-preview__lines">{Array.from({ length: 4 }, (_, i) => <span key={i}><i /><b /></span>)}</div>
              <div className="operation-preview__separator" />
              <div className="operation-preview__lines operation-preview__lines--bottom">{Array.from({ length: 4 }, (_, i) => <span key={i}><i /><b /></span>)}</div>
            </div>
            <div className="operation-preview__switcher">
              <img src={iconSource} onError={() => setIconSource(fallbackIcon)} alt="" />
              <span><strong>{value.operationName || "Escala IMOB"}</strong><small>2 Membros</small></span>
              <span className="operation-preview__arrows">⌃<br />⌄</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
