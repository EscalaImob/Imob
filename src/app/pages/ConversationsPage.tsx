import "./meta.css";

export function ConversationsPage() {
  return (
    <section className="meta-module">
      <header className="app-section-header">
        <div><span className="app-section-eyebrow">Marketing</span><h1>Conversas</h1>
          <p>Estrutura inicial de atendimento para Instagram, Messenger e WhatsApp. A integração de mensagens ainda não foi habilitada.</p></div>
      </header>
      <div className="meta-conversations">
        <section className="meta-panel meta-conversation-column" aria-label="Lista de conversas">
          <h2>Conversas</h2><p className="meta-muted">Instagram · Messenger · WhatsApp</p>
          <div className="meta-conversation-empty"><strong>Nenhuma conversa carregada</strong><p>A consulta de mensagens será disponibilizada em etapa posterior.</p></div>
        </section>
        <section className="meta-panel meta-conversation-column" aria-label="Chat">
          <h2>Chat</h2><div className="meta-conversation-empty"><strong>Nenhuma conversa selecionada</strong><p>O histórico de mensagens ainda não está disponível.</p></div>
          <div className="meta-composer"><label htmlFor="meta-message">Mensagem</label><input id="meta-message" disabled placeholder="Envio indisponível nesta etapa" /><button type="button" className="app-primary-button" disabled>Enviar</button></div>
        </section>
        <section className="meta-panel meta-conversation-column" aria-label="Ficha do contato">
          <h2>Ficha do contato</h2><div className="meta-conversation-empty"><strong>Nenhum contato selecionado</strong><p>Os dados serão exibidos quando houver uma conversa vinculada.</p></div>
        </section>
      </div>
    </section>
  );
}
