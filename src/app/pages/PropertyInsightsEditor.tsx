import { useEffect, useState } from "react";
import type { LandingProperty, LandingSection } from "../../landing-pages/model";
import { emptyPropertyInsight, readPropertyInsights, type PropertyInsight } from "../../landing-pages/propertyInsights";
import "./propertyInsightsEditor.css";

export function PropertyInsightsEditor({ properties, section, disabled, onChange, onRefresh }: {
  properties: LandingProperty[];
  section: LandingSection;
  disabled: boolean;
  onChange: (content: Record<string, unknown>) => void;
  onRefresh?: (propertyId: string) => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || "");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  useEffect(() => { if (!properties.some((property) => property.id === propertyId)) setPropertyId(properties[0]?.id || ""); }, [properties, propertyId]);
  const insights = readPropertyInsights(section);
  const current = insights.find((item) => item.propertyId === propertyId) || emptyPropertyInsight(propertyId);
  const commit = (next: PropertyInsight) => onChange({ ...section.content, propertyInsights: [...insights.filter((item) => item.propertyId !== propertyId), next] });
  async function refresh() {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try { await onRefresh(propertyId); }
    catch (error) { setRefreshError(error instanceof Error ? error.message : "Não foi possível buscar as proximidades."); }
    finally { setRefreshing(false); }
  }
  if (!properties.length) return null;
  return <details className="lp-editor-insights"><summary>Detalhes da página do imóvel</summary><p>Esses dados aparecem publicamente. Informe somente valores verificados e uma localização aproximada, sem endereço privado.</p>
    <label>Imóvel<select disabled={refreshing} value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>{properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}</select></label>
    <h3>Valorização da região</h3><p>Informe valores médios por m² e a fonte. O gráfico só aparece quando houver pelo menos dois anos e uma fonte.</p>
    <label>Fonte dos dados<input value={current.valuationSource} disabled={disabled} placeholder="Ex.: relatório de mercado 2025" onChange={(event) => commit({ ...current, valuationSource: event.target.value })}/></label>
    {current.valuations.map((point, index) => <div className="lp-editor-insights__row" key={index}><label>Ano<input value={point.year} maxLength={9} disabled={disabled} placeholder="2025" onChange={(event) => commit({ ...current, valuations: current.valuations.map((entry, itemIndex) => itemIndex === index ? { ...entry, year: event.target.value } : entry) })}/></label><label>R$/m²<input value={point.value} inputMode="decimal" disabled={disabled} placeholder="8500" onChange={(event) => commit({ ...current, valuations: current.valuations.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) })}/></label><button type="button" className="app-secondary-button" disabled={disabled} onClick={() => commit({ ...current, valuations: current.valuations.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remover valor de ${point.year || `linha ${index + 1}`}`}>Remover</button></div>)}
    <button type="button" className="app-secondary-button" disabled={disabled || current.valuations.length >= 12} onClick={() => commit({ ...current, valuations: [...current.valuations, { year: "", value: "" }] })}>+ Adicionar ano</button>
    <h3>Proximidades</h3><button type="button" className="app-secondary-button" disabled={disabled || refreshing || !onRefresh} onClick={() => void refresh()}>{refreshing ? "Buscando serviços e rotas..." : "Buscar proximidades pelo cadastro"}</button>{onRefresh && <p>A busca envia o endereço cadastrado à Geoapify para localizar serviços e calcular rotas a pé. O mapa público respeita a precisão configurada no imóvel.</p>}{refreshError && <p role="alert">{refreshError}</p>}{current.nearbySource && <p>Fonte: {current.nearbySource}{current.nearbyUpdatedAt ? ` · atualização ${current.nearbyUpdatedAt}` : ""}. Revise antes de salvar.</p>}<label>Descrição pública da região<textarea rows={3} disabled={disabled} value={current.proximityDescription} placeholder="Descreva apenas o que foi conferido sobre a região." onChange={(event) => commit({ ...current, proximityDescription: event.target.value })}/></label>
    <p>O mapa tenta localizar automaticamente a região pública ao abrir a prévia ou salvar. Se necessário, informe coordenadas aproximadas; não use a posição exata de um imóvel privado.</p><div className="lp-editor-insights__row"><label>Latitude aproximada<input value={current.mapLatitude} inputMode="decimal" disabled={disabled} placeholder="-23.55" onChange={(event) => commit({ ...current, mapLatitude: event.target.value })}/></label><label>Longitude aproximada<input value={current.mapLongitude} inputMode="decimal" disabled={disabled} placeholder="-46.63" onChange={(event) => commit({ ...current, mapLongitude: event.target.value })}/></label></div>
    <h3>Pontos de interesse</h3><p>Os tempos devem ser conferidos antes de publicar. Deixe vazio se não tiver essa informação.</p>{current.nearby.map((item, index) => <div className="lp-editor-insights__row" key={index}><label>Local<input value={item.name} disabled={disabled} placeholder="Ex.: estação de metrô" onChange={(event) => commit({ ...current, nearbySource: "", nearbyUpdatedAt: "", nearby: current.nearby.map((entry, itemIndex) => itemIndex === index ? { ...entry, name: event.target.value } : entry) })}/></label><label>Tempo informado<input value={item.minutes} disabled={disabled} placeholder="Ex.: 10 min a pé" onChange={(event) => commit({ ...current, nearbySource: "", nearbyUpdatedAt: "", nearby: current.nearby.map((entry, itemIndex) => itemIndex === index ? { ...entry, minutes: event.target.value } : entry) })}/></label><button type="button" className="app-secondary-button" disabled={disabled} onClick={() => commit({ ...current, nearbySource: "", nearbyUpdatedAt: "", nearby: current.nearby.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remover ponto de interesse ${index + 1}`}>Remover</button></div>)}<button type="button" className="app-secondary-button" disabled={disabled || current.nearby.length >= 12} onClick={() => commit({ ...current, nearbySource: "", nearbyUpdatedAt: "", nearby: [...current.nearby, { name: "", minutes: "" }] })}>+ Adicionar local</button>
  </details>;
}
