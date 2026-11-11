// Domain schemas, the typed client, Query hooks and the mock backend (FE2).
// Screens import data hooks from here and never from the mock folder.

export * from "./domain";
export { api, configureApi, ApiError } from "./client";
export * from "./hooks";
export { ApiProvider } from "./provider/ApiProvider";
export { API_MODES, getApiMode, getApiBaseUrl, type ApiMode } from "./mode";
