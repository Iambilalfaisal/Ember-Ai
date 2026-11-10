// Domain schemas, the typed client, Query hooks and the mock backend (FE2).
// Screens import data hooks from here and never from the mock folder.

export const API_MODES = ["mock", "live"] as const;
export type ApiMode = (typeof API_MODES)[number];
