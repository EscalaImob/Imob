import { Brand } from "../components/Brand";
import { PrimaryButton } from "../components/PrimaryButton";

const scrollToDiagnostic = () => document.querySelector("#diagnostico-interativo")?.scrollIntoView({ behavior: "smooth" });
const goToLogin = () => globalThis.location.assign("/login/");

export function Hero() {
  return (
    <section className="hero" id="inicio">
      <header className="site-header content-width">
        <Brand />
        <PrimaryButton onClick={goToLogin}>Login</PrimaryButton>
      </header>

      <div className="hero__content content-width">
        <h1>Você já sabe vender imóveis.<br />Agora precisa construir uma<br className="hero__desktop-break" /> estrutura que faça o seu<br className="hero__desktop-break" /> <span>nome crescer.</span></h1>
        <p>A Escala IMOB ajuda corretores a fortalecer a marca, gerar oportunidades e organizar o processo comercial com mais previsibilidade.</p>
        <PrimaryButton onClick={scrollToDiagnostic}>Solicite seu diagnóstico</PrimaryButton>
      </div>
    </section>
  );
}
