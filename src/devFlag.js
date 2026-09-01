/** Vite injects `import.meta.env`; GitHub Pages serves the source module without it. */
export function isDevMode(env) {
  return Boolean(env?.DEV)
}
