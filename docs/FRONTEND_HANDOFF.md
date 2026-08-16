# Escala IMOB Frontend — Handoff para a Plataforma

> **Status:** documento de orientação para o desenvolvimento futuro do frontend da plataforma.
>
> **Base funcional:** `Especificacao_Funcional_Plataforma_Imobiliaria.pdf`, versão 1.0, julho/2026.
>
> O layout definitivo da plataforma administrativa será criado por outro desenvolvedor/time. Este documento registra limites, contratos e decisões já tomadas para evitar que o frontend atual seja confundido com a arquitetura visual futura.

## 1. Estado atual

O frontend atual é a página pública do **Diagnóstico Escala IMOB**.

Fluxo existente:

```text
escalaimob.com.br
      ↓
DiagnosticFlow
      ↓
POST <VITE_API_URL>/diagnostics
      ↓
Tela de sucesso
```

Esse fluxo está publicado, integrado ao backend e não deve ser quebrado enquanto a plataforma é desenvolvida.

---

## 2. Decisão de rota futura

A página atual é **temporariamente a raiz** do domínio.

### Agora

```text
/  → Diagnóstico Escala IMOB
```

### Futuro

```text
/         → experiência definida pelo novo layout/plataforma
/captura  → Diagnóstico Escala IMOB atual
```

> **Não executar essa mudança de rota agora.**
>
> Ela deve acontecer somente quando existir a nova experiência para `/` e houver validação de deploy, links, analytics e SEO.

O componente/fluxo atual deve ser preservado de forma que possa ser movido para `/captura` com o mínimo de retrabalho.

---

## 3. O layout da plataforma não pertence a este frontend atual

A imagem/referência funcional apresenta módulos como:

- Visão Geral;
- Metas de Vendas;
- Funis;
- Meus Clientes;
- Leads do Site;
- Catálogo de Imóveis;
- Autorizações;
- Tarefas;
- Agenda;
- Gestão de Visitas;
- Contratos;
- Laudos/Vistorias;
- Financeiro;
- Relatórios;
- Configurações;
- Plano/Faturas;
- Suporte.

As capturas do documento são referência estrutural, **não obrigação de reprodução visual literal**.

O novo layout será desenvolvido separadamente. O trabalho do frontend deve respeitar os contratos de API e regras descritos aqui, mas não reutilizar o visual atual do diagnóstico como base do painel.

---

## 4. Responsabilidade do frontend

O frontend é responsável por:

- renderização;
- navegação;
- formulários;
- estados de loading/erro/vazio;
- filtros e parâmetros de consulta;
- acessibilidade;
- feedback visual;
- ocultação de ações que o usuário não possui como melhoria de UX;
- preservação de estado não salvo quando apropriado.

O frontend **não é a fonte da regra de negócio**.

Exemplo:

```text
UI solicita: mover oportunidade para Ganho

Backend decide:
- usuário possui permissão?
- tenant é correto?
- etapa permite a transição?
- campos obrigatórios foram preenchidos?
- deve gerar contrato/tarefa/financeiro/comissão?
- quais registros entram na timeline/auditoria?
```

Nunca assumir que esconder um botão substitui autorização.

---

## 5. Contexto de sessão esperado

O contrato alvo deve permitir ao frontend obter em uma única chamada o contexto necessário para montar a aplicação.

Endpoint planejado:

```http
GET /v1/me
```

Resposta conceitual:

```json
{
  "data": {
    "user": {},
    "organization": {},
    "teams": [],
    "roles": [],
    "capabilities": []
  }
}
```

O frontend deve usar `capabilities` para experiência e navegação, mas toda ação continuará sendo validada no backend.

---

## 6. Multi-tenant no frontend

O tenant ativo deve vir da sessão/contexto autorizado.

Não criar padrões como:

```text
?tenantId=qualquer-id
```

para autorizar dados.

Caso o usuário participe de mais de uma organização, a troca de tenant deve passar por fluxo autenticado e contrato definido pelo backend.

---

## 7. Mapa funcional futuro de rotas

As rotas abaixo são **nomes conceituais**, não decisão final de URL do router. Servem para organizar o trabalho do futuro frontend.

```text
/
├── dashboard
├── goals
├── crm
│   ├── buyers
│   ├── capture
│   ├── opportunities/:id
│   ├── contacts
│   └── leads
├── properties
│   ├── list
│   └── :id/edit
├── authorizations
├── tasks
├── calendar
├── visits
├── contracts
├── inspections
├── finance
├── reports
├── settings
├── billing
├── support
└── account

/captura   (futuro; diagnóstico atual)
```

A rota pública do site imobiliário de cada tenant poderá ter arquitetura separada da aplicação administrativa e ainda depende de decisões de domínio/hosting.

---

## 8. Dois funis, uma base de contatos

O frontend deve representar dois processos comerciais distintos:

### Compradores / interessados

```text
Novo lead
→ Primeiro contato
→ Qualificação
→ Imóveis apresentados
→ Visita agendada
→ Visita realizada
→ Proposta
→ Negociação
→ Ganho / Perdido
```

### Proprietários / captação

```text
Novo proprietário
→ Primeiro contato
→ Proprietário qualificado
→ Avaliação agendada
→ Avaliação realizada
→ Proposta de captação
→ Negociação da captação
→ Documentação e autorização
→ Imóvel captado / Não captado
```

A UI pode ter duas páginas/Kanbans, mas **não deve duplicar o cadastro da pessoa**.

Um mesmo `contactId` pode aparecer em oportunidades dos dois funis.

---

## 9. Contratos de listagem

Listagens devem usar paginação real do backend para volumes altos.

Exemplo:

```http
GET /v1/contacts?page=1&pageSize=25&search=joao&status=active
```

Resposta:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

### Regras de UX

Toda listagem deve prever:

- loading inicial;
- loading de alteração de filtro;
- estado vazio sem filtros;
- estado vazio com filtros;
- erro recuperável;
- paginação/carregamento incremental;
- ação de limpar filtros;
- debounce em busca textual;
- filtros persistentes durante a sessão quando aplicável.

---

## 10. Erros da API

Formato alvo:

```json
{
  "error": {
    "code": "CONTACT_NOT_FOUND",
    "message": "Contato não encontrado.",
    "requestId": "..."
  }
}
```

O frontend pode traduzir `code` em comportamento contextual, mas deve possuir fallback para `message` segura.

Nunca exibir stack trace ou conteúdo técnico bruto ao usuário final.

---

## 11. Estados de mutação

Operações importantes devem possuir estados explícitos:

```text
idle
→ submitting
→ success
   ou
→ error
```

Para ações críticas, evitar atualização visual definitiva antes da confirmação da API, a menos que exista estratégia de optimistic update + rollback bem definida.

Exemplos críticos:

- mover oportunidade;
- ganhar/perder oportunidade;
- publicar imóvel;
- estornar transação;
- mesclar contatos;
- finalizar vistoria;
- cancelar autorização/contrato.

---

## 12. Permissões e navegação

Itens do menu podem ser ocultados conforme capacidades devolvidas pela API.

Exemplo conceitual:

```text
financial.read.organization
properties.publish.organization
opportunities.assign.team
```

Regras:

1. ausência no menu não é segurança;
2. rota direta deve tratar `403` adequadamente;
3. componentes compartilhados devem aceitar capacidades sem acoplar a nomes de cargos;
4. evitar regras como `if (user.role === 'ADMIN')` espalhadas pela interface;
5. preferir helpers de capability.

---

## 13. Cadastro de imóveis

O produto prevê seis áreas de edição:

```text
Dados Básicos
Valores
Detalhes
Autorização
Site
Imagens
```

O frontend deve permitir salvar rascunho incompleto e preservar dados entre etapas.

A publicação é uma **ação do backend**:

```http
POST /v1/properties/:id/publish
```

A UI não deve inferir sozinha que o imóvel está pronto. Deve consumir o resultado de completude/pendências da API.

---

## 14. Informação interna x pública

Esse é um contrato de segurança importante.

O site público deve consumir endpoints/projeções públicas, por exemplo:

```http
GET /v1/public/properties
GET /v1/public/properties/:slug
```

O painel usa:

```http
GET /v1/properties/:id
```

Não reutilizar o JSON administrativo no site e tentar esconder campos no React.

```text
Backend internal entity
      ↓ public projection
Public API response
      ↓
Public website
```

---

## 15. Uploads e arquivos

Direção esperada:

```text
Frontend
  ↓ solicita URL
Backend
  ↓ devolve URL temporária
Frontend
  ↓ upload direto
Storage
  ↓
Frontend confirma conclusão
Backend registra metadata/vínculo
```

Evitar enviar arquivos grandes pelo mesmo Lambda/controller que processa formulários comuns, salvo decisão técnica posterior.

O frontend deve exibir:

- progresso;
- falha por arquivo;
- retry;
- tamanho/formato inválido;
- estado de processamento quando existir.

---

## 16. Timeline

Contato, imóvel e oportunidade terão timeline consolidada.

O frontend deve tratar timeline como coleção append-only de eventos de negócio, e não como formulário editável genérico.

Eventos podem incluir:

- criação;
- mudança de status/etapa;
- troca de responsável;
- notas;
- tarefas;
- visitas;
- propostas;
- documentos.

---

## 17. Dashboard

O dashboard é uma **projeção agregada** dos módulos, não uma fonte independente.

Endpoint alvo:

```http
GET /v1/dashboard/overview
```

Indicadores devem ser clicáveis e levar à tela de origem com filtros equivalentes.

Exemplo:

```text
"7 tarefas pendentes"
  ↓ clique
/tasks?status=pending&scope=mine
```

Os filtros finais serão definidos quando os contratos forem implementados.

---

## 18. API por módulo — visão de consumo

O frontend deve esperar famílias de endpoints como:

```text
/v1/me
/v1/users
/v1/contacts
/v1/leads
/v1/funnels
/v1/opportunities
/v1/properties
/v1/tasks
/v1/calendar/events
/v1/visits
/v1/authorizations
/v1/contracts
/v1/inspections
/v1/transactions
/v1/commissions
/v1/goals
/v1/notifications
/v1/settings/*
/v1/reports/*
```

O contrato detalhado e ordem de implementação pertencem ao documento `BACKEND_ARCHITECTURE.md` no repositório do backend.

---

## 19. O diagnóstico atual

O código atual deve continuar isolado em sua feature.

Quando a nova aplicação chegar, evitar misturar componentes do painel dentro de:

```text
DiagnosticCarousel
DiagnosticFlowLayout
SuccessStep
```

Quando chegar a hora da migração para `/captura`, a mudança ideal será de roteamento/composição, não uma reescrita do diagnóstico.

### Contrato atual

```http
POST <VITE_API_URL>/diagnostics
```

Esse contrato permanece válido até decisão explícita de migração.

---

## 20. O que não fazer no frontend

1. Não duplicar contatos entre funis.
2. Não manter regra crítica apenas em TypeScript do navegador.
3. Não confiar em `tenantId` arbitrário da URL para autorização.
4. Não publicar campos internos escondendo-os apenas com CSS/React.
5. Não calcular saldo, conversão ou métrica gerencial como verdade local quando o backend possui a fonte.
6. Não criar endpoints ad hoc no frontend para cada tela sem alinhar com o catálogo do backend.
7. Não mover o diagnóstico para `/captura` antes de a nova raiz estar pronta.
8. Não assumir que as capturas do PDF são o design final.

---

## 21. Ordem esperada de integração com o backend

O frontend da plataforma deve acompanhar as fases do backend:

```text
1. Auth / tenant / permissions / app shell
2. Contacts / leads / tasks / funnel structure
3. Buyer funnel
4. Capture funnel
5. Properties / public projection
6. Calendar / visits / notifications / dashboard
7. Documents / finance / reports
8. Integrations
```

Evitar construir telas finais dependentes de contratos ainda não definidos.

---

## 22. Critério para mover `/` para a plataforma

A troca só deve ocorrer quando:

- nova experiência da raiz estiver pronta;
- `/captura` estiver roteada e testada;
- formulário continuar enviando ao backend;
- links de Termos e Privacidade funcionarem;
- WhatsApp da tela de sucesso continuar funcionando;
- deploy do GitHub Pages estiver configurado para SPA/rotas necessárias;
- analytics/SEO forem revisados, se aplicável;
- regressão mobile for executada.

Até lá, manter o comportamento atual.

---

## 23. Fonte de verdade

Em caso de divergência:

1. regra funcional escrita na especificação;
2. contrato versionado do backend;
3. decisão técnica registrada em documentação/ADR;
4. layout aprovado;
5. captura de referência.

Capturas visuais antigas não devem prevalecer sobre regra funcional escrita.


## Cadastro/onboarding real

As telas de Figma recebidas em 16/08/2026 definem o fluxo real de `/registro/`. A implementação visual possui quatro etapas e conclusão, sem substituir o diagnóstico atual em `/`.

Regras já fechadas:

- azul principal `#0106FE`;
- assets oficiais em `public/assets/registration/`;
- imagens sempre em `contain`/fit, nunca `cover`/fill;
- os três dropdowns e chips seguem exatamente as opções entregues no Figma;
- o destino de `Começar agora` permanece pendente até o frontend pós-login ser definido;
- integração HTTP deve acompanhar a jornada real, não o catálogo especulativo.

## Registro — integração real do Passo 1

O fluxo `/registro/` deixa de avançar localmente por simples mudança de estado no Passo 1. O botão `Continuar` chama agora:

```text
POST {VITE_API_URL}/registration
```

Somente após resposta `201` válida o frontend:

```text
salva a sessão do onboarding em sessionStorage
→ remove a senha do estado React
→ normaliza o email com a resposta do backend
→ avança para o Passo 2
```

Estados previstos nesta etapa:

```text
formulário inválido → botão não submete
requisição em andamento → "Criando conta..." e bloqueio de clique duplo
409 → email já cadastrado
422 → primeira mensagem de validação retornada pelo backend
429 → mensagem de excesso de tentativas
5xx → indisponibilidade temporária
network/timeout → mensagem própria sem limpar os dados digitados
```

A foto de perfil continua apenas em preview/memória nesta etapa. O arquivo será enviado depois da autenticação, usando a infraestrutura privada de arquivos, quando o endpoint de onboarding autenticado for publicado.

A sessão atual em `sessionStorage` é deliberadamente transitória. Persistência de login e refresh automático serão definidos com as telas reais de login/recuperação de acesso.


## Registro — integração do Passo 2

A tela de preferências não é mais apenas local.

```text
Passo 1
→ POST /registration
→ sessionStorage com access token
→ Passo 2
→ PATCH /onboarding/preferences
→ Passo 3
```

O Continue salva exatamente empresa, atuação, função, foco e chips selecionados. Como o Figma não marca esses campos como obrigatórios e oferece `Pular por enquanto`, o frontend não impõe obrigatoriedade adicional.

`Pular por enquanto` envia `{ "skip": true }` e só avança depois de resposta válida da API.

Se a sessão do onboarding estiver ausente/expirada, o usuário permanece no Passo 2 e recebe erro explícito. Renovação de token será fechada com a jornada real de login.
