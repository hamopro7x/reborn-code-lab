// Shared Gmail activity audit writer.
export async function logActivity(admin: any, row: { actor_id?: string | null; action: string; account_id?: string | null; message_id?: string | null; meta?: any }) {
  await admin.from("mail_activity").insert({ meta: {}, ...row });
}
