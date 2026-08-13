// Stopgap admin identity check, shared by the admin UI gate
// (app/admin/layout.tsx) and server-side AI Engine role resolution
// (lib/ai/serverAuth.ts). Replace with a custom claim (token.admin ===
// true) when admin claims are set up — then this constant can go away.
export const ADMIN_EMAIL = "adminyogimart@gmail.com";
