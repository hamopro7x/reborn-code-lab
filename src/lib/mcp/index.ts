import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProductsTool from "./tools/list-products";
import getProductTool from "./tools/get-product";
import listOrdersTool from "./tools/list-orders";
import getOrderTool from "./tools/get-order";
import salesSummaryTool from "./tools/sales-summary";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mag-pro1-com",
  title: "mag-pro1.com",
  version: "0.1.0",
  instructions:
    "Tools for the mag-pro1.com digital subscriptions store. Use `list_products` and `get_product` to browse the catalog, `list_orders` and `get_order` to inspect orders, and `sales_summary` for revenue totals over a date range. All data access runs as the signed-in store user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProductsTool, getProductTool, listOrdersTool, getOrderTool, salesSummaryTool],
});
