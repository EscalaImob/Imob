# Escala IMOB — Frontend

Página de captura e diagnóstico da Escala IMOB, desenvolvida com React, TypeScript e Vite.

Este repositório contém **somente o frontend**. O backend responsável por validação, persistência e integração com o Google Sheets será mantido em um projeto separado, permitindo evolução e escala independentes.

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior

Quem utiliza `nvm` pode selecionar a versão indicada pelo projeto:

```bash
nvm use
```

## Instalação

```bash
npm ci
```

## Desenvolvimento

```bash
npm run dev
```

O Vite exibirá no terminal o endereço local da aplicação.

## Verificações

Validar os tipos sem gerar arquivos:

```bash
npm run typecheck
```

Gerar o build de produção:

```bash
npm run build
```

Visualizar localmente o build gerado:

```bash
npm run preview
```

## Estrutura principal

```text
src/
├── assets/       # Imagens e arquivos da marca
├── components/   # Componentes reutilizáveis
├── features/     # Regras organizadas por funcionalidade
├── sections/     # Seções e etapas da página
├── styles/       # Estilos globais
└── types/        # Tipos compartilhados do frontend
```

## Integração com o backend

A última etapa do diagnóstico envia um `POST` para `<VITE_API_URL>/diagnostics`. A tela de sucesso só é exibida depois que a API confirma o recebimento. Em caso de falha, as respostas permanecem preenchidas para permitir nova tentativa.

Para desenvolvimento local, crie um arquivo `.env` ou `.env.local` (ambos ignorados pelo Git) e informe a URL pública da API:

```env
VITE_API_URL=https://api.exemplo.com
```

No GitHub Pages, o workflow lê `VITE_API_URL` de **Settings → Secrets and variables → Actions → Variables**. Portanto, quando o backend for publicado, basta criar/atualizar a variável de repositório `VITE_API_URL` e executar um novo deploy; nenhuma alteração de código será necessária.

Enquanto `VITE_API_URL` estiver vazia, o build continua funcionando, mas a etapa final informa que o envio ainda não está disponível e não mostra falso sucesso.

Credenciais do Google, segredos da AWS e outras informações sensíveis nunca devem ser adicionadas a este repositório ou expostas no código executado pelo navegador.

## Arquivos gerados

Os itens abaixo são gerados automaticamente e não devem ser versionados:

- `node_modules/`
- `dist/`
- `*.tsbuildinfo`
- `vite.config.js`
- `vite.config.d.ts`
- arquivos `.env` e variações locais de ambiente

## Handoff para a plataforma

A página atual é o Diagnóstico Escala IMOB. O layout definitivo da plataforma será desenvolvido separadamente e, no futuro, o diagnóstico será movido para `/captura` — **essa mudança não deve ser feita agora**.

As decisões de integração, responsabilidades do frontend e orientações para o próximo desenvolvedor estão em:

```text
docs/FRONTEND_HANDOFF.md
```

## Fluxo de registro

O cadastro/onboarding possui uma entrada estática própria em `/registro/`, sem alterar a landing/diagnóstico atual em `/`.

Os assets finais do Figma devem ser colocados em `public/assets/registration/` com estes nomes exatos:

- `logo_escala_imob.png`
- `logo_simples_escala_imob.png`
- `imagem_fim_registro.png`

Enquanto esses arquivos não estiverem presentes, os componentes usam fallbacks e o build continua funcional.
