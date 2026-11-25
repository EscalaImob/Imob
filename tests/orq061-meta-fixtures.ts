// Explicit synthetic fixtures. Never imported by runtime code.
import type { Capability, MetaAssetV2, MetaConnectionV2, MetaStatusV2, MetaStatus } from "../src/services/metaApi";
export const id = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const orgA = id(1), orgB = id(2);
const pending: Capability = { key: "instagramMessaging", availability: "pending", reason: "META_PERMISSION_REQUIRED", verifiedAt: null };
const denied: Capability = { key: "instagramMessaging", availability: "denied", reason: "FEATURE_DISABLED", verifiedAt: null };
// Deliberately inconsistent aggregate for negative UI test: must not authorize Ads or messaging.
const aggregate: Capability = { key: "adsManage", availability: "available", reason: null, verifiedAt: null };
function asset(n: number, connectionId: string, name: string, type: MetaAssetV2["type"], selected = false, capabilities = [pending]): MetaAssetV2 {
  return { id: id(n), connectionId, name, type, selected, externalId: `fixture-${n}`, capabilities };
}
function connection(n: number, patch: Partial<MetaConnectionV2>): MetaConnectionV2 {
  return { id: id(n), provider: "meta", state: "connected", mode: "test", oauthProduct: "instagram_login_v1", credentialState: "usable", scopes: ["instagram_business_basic", "instagram_business_manage_messages"], assets: [], capabilities: [pending], lastCheckedAt: null, expiresAt: "2099-01-01T00:00:00Z", errorCode: null, ...patch };
}
export const igA = connection(11, { assets: [asset(101, id(11), "Instagram A1 fictício", "instagram_account", true)] });
export const igA2 = connection(12, { assets: [asset(102, id(12), "Instagram A2 fictício", "instagram_account")] });
export const fbA = connection(13, { oauthProduct: "facebook_login_manual", scopes: ["pages_show_list"], assets: [asset(103, id(13), "Página A1 fictícia", "facebook_page", true), asset(104, id(13), "Página A2 fictícia", "facebook_page"), asset(105, id(13), "Ads A fictício", "ad_account", true, [aggregate])] });
export const expiredA = connection(14, { state: "expired", credentialState: "expired", expiresAt: "2020-01-01T00:00:00Z", assets: [asset(106, id(14), "Instagram expirado fictício", "instagram_account", false, [denied])], capabilities: [denied] });
export const revokedA = connection(15, { state: "revoked", credentialState: "revoked", scopes: [], assets: [asset(107, id(15), "Instagram revogado fictício", "instagram_account", false, [denied])], capabilities: [denied], expiresAt: null });
export const legacyA = connection(16, { oauthProduct: null, credentialState: "unverified", state: "pending", errorCode: "META_NOT_CONFIGURED", assets: [asset(108, id(16), "Legado fictício", "instagram_account")] });
export const igB = connection(21, { assets: [asset(201, id(21), "Instagram B fictício", "instagram_account")] });
export const statusA: MetaStatusV2 = { contractVersion: 2, connections: [legacyA, revokedA, expiredA, fbA, igA2, igA], mode: "test", capabilities: [aggregate] };
export const statusB: MetaStatusV2 = { contractVersion: 2, connections: [igB], mode: "test", capabilities: [pending] };
export const empty: MetaStatusV2 = { contractVersion: 2, connections: [], mode: "test", capabilities: [] };
export const v1: MetaStatus = { connection: null, mode: "test", capabilities: [pending] };
