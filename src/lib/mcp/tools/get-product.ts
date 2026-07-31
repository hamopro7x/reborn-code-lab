import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated, errorResult, jsonResult } from "../supabase";

export default defineTool({
  name: "get_product",
  title: "Get product",
  description: "Get the full details of one product by its slug, including description, gallery, pricing and approved reviews count.",
  inputSchema: {
    slug: z.string().describe("The product slug, e.g. 'canva-pro'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select("*, category:categories(name, slug)")
      .eq("slug", slug)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No product found with slug "${slug}".`);
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("product_id", data.id)
      .eq("approved", true);
    return jsonResult({ ...data, approved_reviews: count ?? 0 });
  },
});
