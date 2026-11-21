import { readPages } from "./read-pages.server";
type Customer = {
  email: string; name: string; phone: string; country: string;
  orders: number; confirmed: number; last_at: string; total_by_currency: Record<string, number>;
};
/** Aggregate every order sequentially; preserve newest contact data and existing customer grouping. */
export async function customerSummary(db: any): Promise<Customer[]> {
  const map = new Map<string, Customer>();
  await readPages<any>((from, to) => db.from("orders")
    .select("id,customer_name,customer_email,customer_phone,customer_country,total,currency_code,status,created_at")
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), (orders) => {
    for (const order of orders) {
      const key = (order.customer_email || order.customer_phone || "").toLowerCase();
      if (!key) continue;
      let customer = map.get(key);
      if (!customer) {
        customer = {
          email: order.customer_email, name: order.customer_name, phone: order.customer_phone,
          country: order.customer_country, orders: 0, confirmed: 0, last_at: order.created_at, total_by_currency: {},
        };
        map.set(key, customer);
      }
      customer.orders++;
      if (order.status === "confirmed" || order.status === "completed") {
        customer.confirmed++;
        customer.total_by_currency[order.currency_code] = (customer.total_by_currency[order.currency_code] ?? 0) + Number(order.total);
      }
      if (new Date(order.created_at) > new Date(customer.last_at)) customer.last_at = order.created_at;
    }
  });
  return [...map.values()].sort((a, b) => b.orders - a.orders);
}