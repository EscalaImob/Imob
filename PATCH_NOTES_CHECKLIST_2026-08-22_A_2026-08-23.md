# Escala IMOB — Checklist e Patch Notes

Período coberto: **22/08/2026 a 23/08/2026**  
Escopo: frontend `IMOB`, backend `IMOB-Backend`, banco, AWS e validações.  
Gerado em: **23/08/2026**.

## Legenda de status

- [x] Implementado no código e registrado no Git.
- [ ] Exige publicação, migration ou confirmação funcional em produção.
- **Validado localmente**: passou pelo build ou suíte de validação local.
- **Não confirmado em produção**: não há evidência local suficiente para afirmar que a versão publicada já contém a mudança.

## Resumo executivo

Neste período foi concluída uma rodada ampla de evolução do CRM da Escala IMOB. O trabalho abrangeu rotas de detalhe e ações de ciclo de vida no backend, edição e exclusão explícitas nos módulos operacionais, edição de oportunidades em modal, refinamento da Visão geral, novos gráficos interativos, responsividade e correções específicas para mobile.

O frontend encerrou o período com `npm run build` aprovado. O backend recebeu migration e testes relacionados às novas permissões e rotas. A confirmação final em produção depende do deploy dos commits correspondentes, aplicação/verificação da migration quando aplicável e smoke tests autenticados.

## 1. Backend e API

### CRM e clientes

- [x] Adicionadas/completadas rotas de detalhe para contatos do CRM.
- [x] Tratado o fluxo necessário para buscar um cliente antes de editar.
- [x] Implementadas ações de atualização e ciclo de vida de contatos.
- [x] Implementada exclusão/arquivamento conforme a regra do domínio.
- [x] Ajustados serviço, domínio, repositório Drizzle e handler HTTP do CRM.
- [x] Adicionados testes de template para as rotas de contatos.
- [x] Adicionados testes de serviço para os fluxos atualizados.
- [ ] Confirmar em produção que `GET /crm/contacts/{id}` não retorna mais `404`.
- [ ] Confirmar em produção que respostas de erro e sucesso incluem os cabeçalhos CORS esperados.

### Leads e funis

- [x] Ajustadas rotas e ações de ciclo de vida de leads.
- [x] Validada a propriedade/ownership das rotas de lifecycle no template SAM.
- [x] Adicionados testes de regressão operacional de SLA de leads.
- [x] Adicionados testes de template para rotas de leads.

### Imóveis

- [x] Evoluídos domínio, serviço e repositório de propriedades.
- [x] Ajustados handlers de portfólio para suportar as ações usadas pelo frontend.
- [x] Adicionados/atualizados testes de serviço de imóveis.
- [ ] Fazer smoke autenticado de detalhe, edição e exclusão/arquivamento em produção.

### Contratos

- [x] Evoluídos serviço, domínio e repositório de contratos corporativos.
- [x] Ajustados handlers HTTP para ações de edição e exclusão.
- [ ] Fazer smoke autenticado de edição e exclusão em produção.

### Laudos e vistorias

- [x] Evoluídos serviço, domínio e repositório de inspeções corporativas.
- [x] Ajustados handlers HTTP para edição e exclusão.
- [ ] Fazer smoke autenticado dos fluxos de laudo e vistoria em produção.

### Produtividade e calendário

- [x] Evoluídos serviço, domínio e repositório de produtividade.
- [x] Ajustado o handler do calendário.
- [x] Criada a migration `0035_productivity_calendar_update_permission.sql`.
- [x] Adicionados testes de template e serviço para produtividade/calendário.
- [ ] Confirmar no Aurora que a migration 0035 foi aplicada no ambiente-alvo.
- [ ] Executar a verificação pós-migration prevista pelo projeto.

### Infraestrutura e respostas HTTP

- [x] Atualizado `template.yaml` com as rotas e permissões necessárias.
- [x] Ajustada a camada compartilhada de respostas HTTP.
- [x] Adicionados testes para validar a presença e ownership das rotas no template.

## 2. Frontend — ações e edição dos módulos

### Clientes

- [x] Tornados visíveis os botões de **Editar** e **Excluir**.
- [x] Melhorada a descoberta das ações no desktop e no mobile.
- [x] Integrado o frontend às operações de detalhe, atualização e exclusão do CRM.
- [x] Evitado depender do clique na linha inteira para encontrar ações importantes.
- [ ] Confirmar ponta a ponta contra a API publicada: abrir, alterar, salvar, recarregar e excluir.

### Funis de compradores e captação

- [x] Substituída a navegação para página de edição por um card/modal flutuante.
- [x] A oportunidade pode ser aberta e editada no contexto do Kanban.
- [x] Reduzidos reloads e loadings desnecessários.
- [x] Mantida atualização localizada do quadro após alterações.

### Imóveis

- [x] Adicionados controles explícitos de edição e exclusão no catálogo.
- [x] Atualizada a integração do serviço de propriedades.
- [x] Mantida adaptação das ações para desktop e mobile.

### Publicações e autorizações

- [x] Adicionados/refinados controles operacionais de edição e exclusão.
- [x] Ajustadas tabelas, colunas de ações e comportamento responsivo.
- [x] Refinados filtros e alinhamentos do módulo de autorizações.

### Agenda, tarefas e visitas

- [x] Mantidas ações de edição com atualização localizada.
- [x] Adicionados/refinados controles explícitos de ciclo de vida.
- [x] Ajustadas telas de Agenda e Gestão de visitas.
- [x] Atualizados serviços de produtividade para suportar as ações da interface.

### Contratos, laudos e vistorias

- [x] Adicionados botões explícitos de **Editar** e **Excluir**.
- [x] Mantidas confirmações antes de operações destrutivas.
- [x] Atualizados os clientes de API de contratos e inspeções.
- [x] Padronizadas ações em tabelas e cards.

### Usuários e equipes

- [x] Refinada a área de usuários e equipes.
- [x] Trabalhada a edição de informações do usuário/administrador, incluindo apresentação de foto e dados.
- [x] Mantida distinção de permissões para ações administrativas e exclusão de usuários inferiores ao administrador.
- [ ] Validar em produção com perfis de acesso diferentes do administrador.

## 3. Visão geral e pipeline comercial

### Integração de indicadores

- [x] A Visão geral passou a consumir dados reais de funis, tarefas, imóveis, financeiro e visitas.
- [x] Indicadores principais foram ligados às respostas dos módulos.
- [x] Adicionados estados de carregamento e aviso para falhas parciais.
- [x] Pipeline comercial ampliado e reorganizado.
- [x] Removida a lista duplicada de etapas que ocupava a lateral do pipeline.

### Gráfico de distribuição (donut)

- [x] Substituído o donut estático por segmentos SVG independentes.
- [x] Hover/foco destaca e ilumina a fatia correspondente.
- [x] Clique mantém ou remove o destaque da fatia.
- [x] Adicionados checkboxes para habilitar e desabilitar etapas.
- [x] Total central, fatias e percentuais são recalculados conforme os itens ativos.
- [x] Adicionado suporte de teclado e atributos de acessibilidade.
- [x] Aumentado o donut no desktop e ajustado o tamanho no mobile.
- [x] Ampliados legenda, marcadores, percentuais e checkboxes.

### Gráfico de volume por etapa

- [x] Reconstruído com escala vertical, grade e legenda de eixo.
- [x] Barras passam a começar corretamente na base.
- [x] Corrigida a herança de `margin: auto` que fazia barras flutuarem.
- [x] Adicionados valores visíveis nas barras.
- [x] Adicionado filtro por todos os funis, compradores e captação.
- [x] Em “Todos os funis”, as etapas são consolidadas por posição para evitar vinte barras comprimidas.
- [x] Escala arredondada para evitar números repetidos.
- [x] Mantido tooltip nativo com nomes e volume real.

### Gráfico de evolução

- [x] Reconstruído com grade, área preenchida, linha, pontos e datas.
- [x] Adicionado tooltip interativo com data e quantidade de negócios.
- [x] O gráfico usa datas reais de criação das oportunidades disponíveis na API.
- [x] Adicionados filtros: últimos 7 dias, últimos 15 dias, este mês, últimos 30 dias e últimos 90 dias.
- [x] Corrigido o SVG para usar toda a largura do card.
- [x] Aumentada a área útil para melhorar a leitura.
- Observação: concentrações ou saltos na curva refletem as datas reais dos registros cadastrados; não são valores fictícios do componente.

### KPIs e resumo

- [x] Adicionados KPIs de total de negócios, ganhos, conversão e tempo médio.
- [x] Adicionado resumo com negócios ativos, ganhos, em negociação, contatos únicos e valor do pipeline.
- [x] Mantidos gráficos auxiliares compactos nos cards.

## 4. Calendário, portfólio e composição da Visão geral

- [x] Calendário semanal recebeu mais altura e espaço para compromissos.
- [x] Portfólio ativo foi reduzido e movido para uma coluna lateral compacta no desktop.
- [x] Próximas visitas foram organizadas junto à coluna lateral.
- [x] No mobile, o calendário usa rolagem horizontal interna e encaixe entre os dias.
- [x] Corrigida a reserva de linhas implícitas gigantes do CSS Grid no mobile.
- [x] Em telas de até 720 px, a Visão geral passa a usar fluxo Flexbox vertical.
- [x] Pipeline, gráficos, KPIs, portfólio, calendário e visitas são empilhados no mobile.
- [x] Removidas posições de linha/coluna herdadas do desktop no breakpoint mobile.
- [ ] Confirmar o resultado após publicação usando aparelho real e cache atualizado.

## 5. Tema, UX e responsividade

- [x] Padronizadas superfícies, textos, bordas e controles com os tokens de tema da conta.
- [x] Refinadas tabelas e ações em desktop e mobile.
- [x] Mantidas ações importantes visíveis, sem depender de menus ocultos.
- [x] Ajustadas larguras mínimas que causavam overflow horizontal.
- [x] Adicionadas regras específicas para telas de 900 px, 720 px e 560 px.
- [x] Preservada acessibilidade de foco nos novos controles dos gráficos.

## 6. AWS, banco e deploy

### Fluxo operacional definido

- [x] PC local reservado para edição, testes, `npm run validate` e `npm run build`.
- [x] AWS CloudShell definido como ambiente para RDS Data API, migrations e deploy manual SAM.
- [x] GitHub Actions definido como fluxo normal de deploy por OIDC.
- [x] Drizzle Studio removido como requisito operacional por incompatibilidade com o driver/SDK da Data API.

### IAM do deploy

- [x] Identificada a role `imob-backend-github-deploy-role`.
- [x] Definida a inline policy `ImobBackendDeploymentSecretsRead`.
- [x] Escopo restrito a `secretsmanager:GetSecretValue` nos dois secrets necessários.
- [x] Evitado `Resource: "*"`.
- [ ] Confirmar que o workflow anteriormente bloqueado foi reexecutado com sucesso.
- [ ] Confirmar que a stack saiu do rollback e publicou a versão esperada.

### Banco e migration

- [x] Definido uso de AWS CloudShell + RDS Data API para inspeção operacional.
- [x] Registrada migration 0035 no backend.
- [ ] Conferir identidade no CloudShell com `aws sts get-caller-identity`.
- [ ] Executar/verificar migrations usando os scripts e variáveis existentes no projeto.
- [ ] Validar diretamente no Aurora as estruturas alteradas.

## 7. Validações realizadas

- [x] Frontend validado repetidamente com `npm run build` após as alterações dos gráficos e mobile.
- [x] TypeScript compilou sem erro.
- [x] Vite concluiu a geração de produção.
- [x] Backend possui testes adicionados/atualizados para CRM, propriedades, produtividade e templates SAM.
- [x] Foi executado `npm run validate` no backend durante o fluxo de trabalho informado.
- Atenção: o Vite continua emitindo aviso não bloqueante de chunk principal acima de 500 kB. Isso não impede o build, mas recomenda code splitting futuro.

## 8. Checklist obrigatório antes de encerrar a entrega

### Frontend

- [ ] Publicar os commits mais recentes do frontend.
- [ ] Abrir a Visão geral no desktop e conferir donut, volume e evolução.
- [ ] Testar filtros dos dois gráficos.
- [ ] Testar checkboxes, hover, clique e teclado na legenda do donut.
- [ ] Testar em largura de 720 px, 560 px e em aparelho físico.
- [ ] No celular, confirmar ausência do grande espaço vazio observado anteriormente.
- [ ] Confirmar exibição do calendário e sua rolagem horizontal.
- [ ] Limpar cache/fechar a aba do domínio após o deploy antes do reteste.

### Backend/API

- [ ] Confirmar deploy do backend correspondente aos commits de 22/08.
- [ ] Confirmar aplicação da migration 0035.
- [ ] Fazer smoke autenticado de clientes, imóveis, contratos, laudos/vistorias, produtividade e leads.
- [ ] Confirmar ausência de `404`, `CORS` e `ERR_FAILED` nas rotas de detalhe.
- [ ] Confirmar que edição e exclusão persistem no banco.

### Segurança e permissões

- [ ] Testar ações como administrador.
- [ ] Testar ações como usuário de cargo inferior.
- [ ] Confirmar que ações não autorizadas permanecem bloqueadas pela API.
- [ ] Revisar CloudWatch e logs do API Gateway após os smoke tests.

## 9. Commits incluídos no levantamento

### Frontend — 23/08/2026

- `3bb6d36` — `fix: complete platform editing and lifecycle actions`
- `571a97b` — `segunda leva`
- `4becc94` — `resumo dashboard`
- `0bf6ccc` — `att graficos`
- `d567a32` — `corrigindo grafico de barras`
- `26b0cbe` — `sei la`
- `540df0a` — `sei la de novo`
- `95929ef` — `correção mobile`

### Backend — 22/08/2026

- `c998af0` — `fix: complete CRM detail routes and lifecycle actions`
- `7a3bce2` — `fix: validate lifecycle route ownership`

## 10. Arquivos principais alterados

### Frontend

- `src/app/App.tsx`
- `src/app/app.css`
- `src/app/pages/AgendaPage.tsx`
- `src/app/pages/AuthorizationsPage.tsx`
- `src/app/pages/ClientsPage.tsx`
- `src/app/pages/ContractsPage.tsx`
- `src/app/pages/FinancePage.tsx`
- `src/app/pages/FunnelPage.tsx`
- `src/app/pages/InspectionsPage.tsx`
- `src/app/pages/LeadsPage.tsx`
- `src/app/pages/PropertiesPage.tsx`
- `src/app/pages/PublicationsPage.tsx`
- `src/app/pages/SettingsPage.tsx`
- `src/app/pages/VisitsPage.tsx`
- `src/services/contractsApi.ts`
- `src/services/crmApi.ts`
- `src/services/inspectionsApi.ts`
- `src/services/productivityApi.ts`
- `src/services/propertiesApi.ts`

### Backend

- `drizzle/0035_productivity_calendar_update_permission.sql`
- Serviços de contratos, inspeções, CRM, produtividade e propriedades.
- Domínios e contratos de repositório correspondentes.
- Repositórios Drizzle correspondentes.
- Handlers HTTP de contratos, inspeções, contatos, leads, propriedades e calendário.
- `src/interfaces/http/response.ts`
- `template.yaml`
- Testes de CRM, leads, produtividade, propriedades e regressão operacional.

---

Documento baseado no histórico Git local e nas validações executadas. Itens de produção permanecem desmarcados quando não houve evidência verificável de deploy, migration ou smoke test no ambiente publicado.
