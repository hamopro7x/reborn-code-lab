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

// Redirect fly.dev subdomain to the custom domain (production only)
const domainRedirectMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    if (host.endsWith(".fly.dev")) {
      const target = `https://mag-pro1.com${url.pathname}${url.search}${url.hash}`;
      return new Response(null, {
        status: 301,
        headers: { location: target },
      });
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [domainRedirectMiddleware, errorMiddleware],
}));
