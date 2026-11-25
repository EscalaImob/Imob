export type LegalDocument = "terms" | "privacy";

export const legalDocuments = {
  terms: { title: "Termos de Uso", path: "/termos-de-uso/" },
  privacy: { title: "Política de Privacidade", path: "/politica-de-privacidade/" },
} as const;
export const dataDeletionPath = "/exclusao-de-dados/";

export const WHATSAPP_DISPLAY = "+55 48 9995-7901";

function TermsContent({ heading: Heading }: { heading: "h2" | "h3" }) {
  return (
    <>
      <p><strong>Última atualização:</strong> 7 de agosto de 2026.</p>

      <Heading>1. Sobre estes Termos</Heading>
      <p>Estes Termos de Uso regulam o acesso e o uso do site <strong>escalaimob.com.br</strong>, do Diagnóstico Escala IMOB e dos canais de contato disponibilizados pela Escala IMOB.</p>

      <Heading>2. Finalidade do Diagnóstico</Heading>
      <p>O diagnóstico tem finalidade informativa e comercial. As respostas ajudam a Escala IMOB a compreender o momento profissional do participante, organizar o atendimento e direcionar uma conversa com um especialista.</p>

      <Heading>3. Informações fornecidas pelo usuário</Heading>
      <p>Ao preencher o diagnóstico, você se compromete a informar dados verdadeiros e atualizados. Você é responsável pelo conteúdo que fornecer e deve evitar o envio de informações de terceiros sem autorização.</p>

      <Heading>4. Contato comercial</Heading>
      <p>Ao concluir o diagnóstico, você solicita contato da Escala IMOB pelos dados informados, inclusive por WhatsApp e e-mail, para continuidade do atendimento relacionado aos produtos, serviços e soluções da Escala IMOB.</p>

      <Heading>5. Ausência de garantia de resultado</Heading>
      <p>O diagnóstico e as conversas decorrentes dele não garantem resultado comercial, financeiro, de vendas, posicionamento ou qualquer outro desempenho específico. Eventuais contratações serão tratadas separadamente, com suas próprias condições.</p>

      <Heading>6. Propriedade intelectual</Heading>
      <p>Marcas, identidade visual, textos, elementos gráficos, estrutura do diagnóstico e demais conteúdos do site pertencem aos seus respectivos titulares e não podem ser reproduzidos ou explorados comercialmente sem autorização.</p>

      <Heading>7. Disponibilidade do site</Heading>
      <p>A Escala IMOB pode realizar manutenções, ajustes e atualizações no site. Embora sejam adotadas medidas razoáveis para manter o serviço disponível, não é garantido funcionamento ininterrupto.</p>

      <Heading>8. Alterações destes Termos</Heading>
      <p>Estes Termos poderão ser atualizados para refletir mudanças no serviço, na operação ou em requisitos legais. A versão vigente será aquela disponibilizada neste site.</p>

      <Heading>9. Contato</Heading>
      <p>Em caso de dúvidas sobre estes Termos, fale com a Escala IMOB pelo WhatsApp <strong>{WHATSAPP_DISPLAY}</strong>.</p>
    </>
  );
}

function PrivacyContent({ heading: Heading }: { heading: "h2" | "h3" }) {
  return (
    <>
      <p><strong>Última atualização:</strong> 7 de agosto de 2026.</p>

      <Heading>1. Quem trata seus dados</Heading>
      <p>Para fins desta Política, Escala IMOB é a responsável pelo tratamento dos dados coletados por meio do site <strong>escalaimob.com.br</strong> e do Diagnóstico Escala IMOB. Para assuntos de privacidade, o contato disponível é o WhatsApp <strong>{WHATSAPP_DISPLAY}</strong>.</p>

      <Heading>2. Dados coletados</Heading>
      <p>Durante o diagnóstico, podemos coletar: nome, WhatsApp, e-mail, área de atuação, Instagram, cidade e estado, objetivo principal, prioridade informada, data e hora do envio, identificador do envio e origem do cadastro.</p>

      <Heading>3. Para que usamos esses dados</Heading>
      <p>Os dados são utilizados para receber e organizar o diagnóstico, entrar em contato com você, dar continuidade ao atendimento solicitado, entender seu perfil e necessidades, prevenir falhas e abusos no formulário e manter registros necessários à operação e ao exercício regular de direitos.</p>

      <Heading>4. Base legal e manifestação de vontade</Heading>
      <p>Ao prosseguir com o formulário e enviar seus dados, você manifesta sua vontade de receber o atendimento solicitado e autoriza o tratamento das informações necessárias para essa finalidade. Quando aplicável, determinados tratamentos também poderão ocorrer para cumprimento de obrigação legal ou regulatória e exercício regular de direitos.</p>

      <Heading>5. Compartilhamento e operadores</Heading>
      <p>Os dados podem ser processados por fornecedores de tecnologia usados para hospedar o site, executar o backend, autenticar serviços e armazenar os registros do diagnóstico, incluindo serviços da Amazon Web Services, Google Workspace/Google Cloud e GitHub, sempre na medida necessária à operação.</p>

      <Heading>6. Transferência internacional</Heading>
      <p>Alguns fornecedores de tecnologia podem processar ou armazenar dados em infraestrutura localizada fora do Brasil. Nesses casos, buscamos utilizar provedores reconhecidos e mecanismos compatíveis com a legislação aplicável.</p>

      <Heading>7. Armazenamento e retenção</Heading>
      <p>Os dados serão mantidos pelo período necessário para realizar o atendimento, manter o relacionamento solicitado e atender obrigações legais ou necessidades legítimas de registro. Quando deixarem de ser necessários, poderão ser excluídos ou anonimizados, ressalvadas hipóteses legais de conservação.</p>

      <Heading>8. Seus direitos</Heading>
      <p>Nos termos da Lei Geral de Proteção de Dados (LGPD), você pode solicitar, conforme aplicável, confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos, informação sobre compartilhamentos, portabilidade, revogação do consentimento e outras medidas previstas em lei.</p>

      <Heading>9. Segurança</Heading>
      <p>Adotamos medidas técnicas e organizacionais compatíveis com o contexto do serviço, incluindo separação entre frontend e backend, controle de acesso e autenticação entre serviços, com o objetivo de reduzir riscos de acesso, alteração ou divulgação não autorizados.</p>

      <Heading>10. Atualizações desta Política</Heading>
      <p>Esta Política poderá ser atualizada para refletir mudanças no serviço, na infraestrutura ou na legislação. A versão vigente ficará disponível neste site.</p>

      <Heading>11. Contato sobre privacidade</Heading>
      <p>Para exercer direitos ou esclarecer dúvidas sobre o tratamento de dados, entre em contato pelo WhatsApp <strong>{WHATSAPP_DISPLAY}</strong>.</p>
    </>
  );
}

export function LegalContent({ document, heading = "h3" }: { document: LegalDocument; heading?: "h2" | "h3" }) {
  return document === "terms" ? <TermsContent heading={heading} /> : <PrivacyContent heading={heading} />;
}
