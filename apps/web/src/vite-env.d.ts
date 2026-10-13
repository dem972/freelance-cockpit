/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" hides the demo route (build-time flag). */
  readonly VITE_DEMO?: string;
  /** Public repository URL, linked in the footer (AGPL-3.0 §13: offer the source to network users). */
  readonly VITE_SOURCE_URL?: string;
}
