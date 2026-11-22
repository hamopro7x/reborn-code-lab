import { z } from "zod";

/** Shared request schemas for independent Gmail server-function groups. */
export const listInput = z.object({
  view: z.enum(["inbox", "sent", "drafts", "archive", "starred", "spam", "trash", "label", "all"]).default("inbox"),
  accountId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  before: z.string().max(40).optional(),
});

export const sendInput = z.object({
  accountId: z.string().uuid(),
  to: z.string().trim().min(3).max(2000),
  cc: z.string().max(2000).optional().default(""),
  subject: z.string().max(500).default(""),
  body: z.string().max(200_000).default(""),
  replyToId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  attachments: z.array(z.object({ filename: z.string().max(200), mimeType: z.string().max(120), base64: z.string() })).max(10).optional(),
});
