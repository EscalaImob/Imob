import type { LandingSection, LandingSectionType, LandingTheme } from "./model";
import { defaultTheme } from "./model";
export interface LandingTemplate { id: string; version: number; name: string; description: string; supportedSections: LandingSectionType[]; defaultTheme: LandingTheme; createSections(): LandingSection[]; }
const section = (type: LandingSectionType, order: number, content: Record<string, unknown>): LandingSection => ({ id: crypto.randomUUID(), type, order, visible: true, content, settings: {} });
export const classicTemplate: LandingTemplate = { id: "classic-real-estate", version: 1, name: "Clássico imobiliário", description: "Apresentação elegante, editorial e focada em imóveis.", supportedSections: ["hero","featured-properties","about","services","regions","contact","footer"], defaultTheme,
  createSections: () => [
    section("hero",0,{ title:"Imóveis que combinam com o seu próximo capítulo.", description:"Encontre oportunidades selecionadas para morar, investir ou transformar seus planos em um novo endereço.", buttonLabel:"Ver imóveis", buttonLink:"#imoveis", imageUrl:"", navPropertiesLabel:"Imóveis", navAboutLabel:"Sobre mim", navContactLabel:"Contato", propertiesStatLabel:"imóveis selecionados", credentialStatLabel:"credenciamento", locationStatLabel:"localização" }),
    section("featured-properties",1,{ title:"Imóveis em destaque", description:"Oportunidades selecionadas para quem busca comprar, investir ou encontrar o imóvel certo." }),
    section("about",2,{ eyebrow:"Prazer, sou seu consultor", title:"Atendimento próximo e estratégico", description:"Conte com conhecimento de mercado, transparência e atenção aos detalhes em cada etapa.", imageUrl:"" }),
    section("services",3,{ title:"Como posso ajudar", items:[{title:"Encontrar seu imóvel",description:"Curadoria alinhada ao seu perfil."},{title:"Vender seu imóvel",description:"Estratégia de divulgação e negociação."},{title:"Investir em imóveis",description:"Análise de oportunidades."},{title:"Avaliar seu imóvel",description:"Posicionamento técnico de mercado."}] }),
    section("regions",4,{ title:"Regiões atendidas", items:[{title:"Centro",imageUrl:""},{title:"Região Norte",imageUrl:""},{title:"Região Sul",imageUrl:""}] }),
    section("contact",5,{ title:"Fale comigo", description:"Conte o que você procura e receba um atendimento personalizado.", nameLabel:"Nome completo", whatsappLabel:"WhatsApp", emailLabel:"E-mail", interestLabel:"Interesse", buyerOptionLabel:"Comprar ou alugar", captureOptionLabel:"Anunciar meu imóvel", messageLabel:"Mensagem", buttonLabel:"Enviar mensagem", successMessage:"Mensagem enviada. Em breve entraremos em contato." }),
    section("footer",6,{ description:"Imóveis selecionados para quem busca comprar, vender ou investir com segurança.", copyrightText:"Todos os direitos reservados." }),
  ] };
export const landingTemplateRegistry = { [classicTemplate.id]: classicTemplate } as const;
