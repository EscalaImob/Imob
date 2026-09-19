# Testar mapa e proximidades da landing page localmente

Este fluxo de desenvolvimento usa o catálogo da API configurada em `VITE_API_URL`, mas consulta a Geoapify pelo servidor local do Vite. A chave nunca vai para o navegador nem para o Git.

1. Crie uma chave em [Geoapify MyProjects](https://myprojects.geoapify.com/).
2. No arquivo ignorado `IMOB/.env.local`, mantenha `VITE_LANDING_INSIGHTS_LOCAL=true` e adicione `GEOAPIFY_API_KEY=<sua chave>`. Não use o prefixo `VITE_` na chave.
3. Em `IMOB-Backend`, execute `npm run build`. O servidor local importa o serviço compilado desse diretório irmão.
4. Reinicie o frontend (`npm run dev`). Faça login, abra uma landing page e use **Ver em nova guia**: ao abrir o detalhe de um imóvel sem coordenadas, a prévia local busca automaticamente um mapa aproximado pela localização pública. Ao clicar em **Salvar** no editor, mapas ausentes dos imóveis selecionados são buscados e gravados no conteúdo da landing page para a página publicada. Para incluir também pontos de interesse e tempos a pé, selecione o imóvel e clique em **Buscar proximidades pelo cadastro**.

O imóvel precisa ter coordenadas válidas, localização pública com bairro/cidade ou endereço interno com logradouro e cidade; a visibilidade do endereço na aba Site não pode estar como `hidden`. A busca de proximidades usa locais encontrados e rotas a pé, por isso nem toda categoria aparecerá. O mapa público recebe coordenadas arredondadas conforme a visibilidade escolhida. O link **Abrir no Google Maps** continua disponível, mas o mapa embutido é do OpenStreetMap; a API oficial de incorporação do Google exigiria outra chave.

Sem a chave, a busca retorna uma instrução de configuração. A rota local só aceita requisições originadas no próprio computador. Fora do modo de desenvolvimento, o editor usa o endpoint autenticado do backend normalmente; para funcionar na publicação após o deploy, o backend também precisa da chave `GEOAPIFY_API_KEY`. `VITE_LANDING_INSIGHTS_LOCAL` não deve ser habilitado em produção.

O gráfico de valorização é preenchido automaticamente pela série histórica oficial do Índice FipeZAP usando o recorte da cidade (preço médio anunciado de venda por m²). A página mostra fonte e período; quando a FipeZAP não cobre a cidade, o gráfico informa o motivo sem estimar valores. Fonte: https://www.fipe.org.br/pt-br/indices/fipezap.
