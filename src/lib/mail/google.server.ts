/**
 * Stable Google/Gmail server facade.
 * Keep existing imports working while OAuth, token lifecycle, and API transport stay isolated.
 */
export { GMAIL_SCOPES, oauthConfig, authUrl, exchangeCode, verifiedIdentity, revokeToken } from "./google-oauth.server";
export { accessTokenFor, ReauthError } from "./google-token.server";
export { gmail, GmailHttpError } from "./gmail-api.server";
