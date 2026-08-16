import { useState } from "react";
import { ArrowRightIcon, CheckIcon } from "../components/icons";

const completionImagePath = "/assets/registration/imagem_fim_registro.png";

export function DoneStep() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <section className="registration-card registration-card--done">
      <div className="registration-done-image">
        {!imageFailed ? <img src={completionImagePath} alt="Configuração concluída" onError={() => setImageFailed(true)} /> : <div className="registration-done-placeholder"><div className="registration-building">▥</div><span><CheckIcon /></span></div>}
      </div>
      <h2>Tudo pronto!</h2>
      <p>Concluímos sua configuração inicial. A partir<br className="desktop-only" /> de agora, você pode começar a estruturar sua<br className="desktop-only" /> operação, cadastrar imóveis e organizar suas<br className="desktop-only" /> oportunidades em um só lugar.</p>
      <button className="registration-primary registration-primary--start" type="button">Começar agora <ArrowRightIcon /></button>
    </section>
  );
}
