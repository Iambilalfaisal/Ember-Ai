export const PREFS_KEY = "ember.prefs";

/**
 * Runs before the first paint so a saved dark theme never flashes light. It reads the same key the
 * store writes. Kept as a string because it is inlined into the page head.
 */
export const THEME_INIT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"null");var t=p&&p.state&&p.state.theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
