export interface Order {
  _id: string;
  title: string;
  address: string;
  status: "pending" | "shipped" | "delivering" | "delivered";
  createdAt: string;
  updatedAt: string;
}

/** Cloudflare Tunnel 后端地址 */
const BASE = "https://system-backend.zeabur.app/api/orders";

/** 获取全部订单 */
export async function fetchOrders(): Promise<Order[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

/** 获取单个订单详情 */
export async function fetchOrder(id: string): Promise<Order> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error("Failed to fetch order");
  return res.json();
}

/** 创建订单 */
export async function createOrder(payload: { title: string; address: string }) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create order");
  return res.json();
}

/** 发货（修改订单状态） */
export async function shipOrder(id: string) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "shipped" }),
  });
  if (!res.ok) throw new Error("Failed to update order status");
  return res.json();
}

/** 请求路线规划 */
export async function requestRoute(
  shopAddress: string,
  customerAddress: string
) {
  const res = await fetch(`${BASE}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopAddress, customerAddress }),
  });
  if (!res.ok) throw new Error("Failed to request route");
  return res.json();
}
