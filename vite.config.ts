import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        capture: "captura/index.html",
        registration: "registro/index.html",
        login: "login/index.html",
        verifyEmail: "verificar-email/index.html",
        forgotPassword: "recuperar-senha/index.html",
        resetPassword: "redefinir-senha/index.html",
        app: "app/index.html",
        appAdmin: "app/admin/index.html",
        appGoals: "app/metas/index.html",
        appClients: "app/clientes/index.html",
        appLeads: "app/leads/index.html",
        appBuyersFunnel: "app/funis/compradores/index.html",
        appCaptureFunnel: "app/funis/captacao/index.html",
        appOpportunity: "app/oportunidade/index.html",
        appTasks: "app/tarefas/index.html",
        appAgenda: "app/agenda/index.html",
        appVisits: "app/visitas/index.html",
        appProperties: "app/imoveis/index.html",
        appProperty: "app/imovel/index.html",
        appPublications: "app/publicacoes/index.html",
        appLandingPages: "app/landing-pages/index.html",
        landingPagePreview: "imob/preview/index.html",
        appAuthorizations: "app/autorizacoes/index.html",
        appAuthorization: "app/autorizacao/index.html",
        appContracts: "app/contratos/index.html",
        appContract: "app/contrato/index.html",
        appInspections: "app/vistorias/index.html",
        appInspection: "app/vistoria/index.html",
        appFinance: "app/financeiro/index.html",
        appReports: "app/relatorios/index.html",
        appSettings: "app/configuracoes/index.html",
      },
    },
  },
});
