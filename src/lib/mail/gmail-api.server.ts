// Authenticated Gmail REST client with bounded retries and content-safe logging.
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailHttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

export async function gmail(token: string, path: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    if (res.ok) return res.status === 204 ? null : res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1) ** 2));
      continue;
    }
    // Log status only — never bodies (may contain mail content).
    console.error(`Gmail API ${res.status} on ${path.split("?")[0].replace(/\\/[A-Za-z0-9_-]{10,}/g, "/:id")}`);
    throw new GmailHttpError(res.status, `Gmail error [${res.status}]`);
  }
  throw new GmailHttpError(500, "Gmail error");
}
