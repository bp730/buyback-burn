function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[${ts()}] INFO  ${msg}`, extra ?? ""),
  warn: (msg: string, extra?: Record<string, unknown>) =>
    console.warn(`[${ts()}] WARN  ${msg}`, extra ?? ""),
  error: (msg: string, extra?: Record<string, unknown>) =>
    console.error(`[${ts()}] ERROR ${msg}`, extra ?? ""),
};
