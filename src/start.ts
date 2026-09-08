import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Prevent Google from indexing the default fly.dev subdomain, but keep it usable.
const flyDevNoIndexMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const response = await next();
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (response instanceof Response && host.endsWith(".fly.dev")) {
      response.headers.set("x-robots-tag", "noindex, nofollow");
    }
    return response;
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [flyDevNoIndexMiddleware, errorMiddleware],
}));
