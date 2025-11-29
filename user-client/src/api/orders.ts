/* ===========================================
   类型定义（完全匹配你的后端）
=========================================== */

export interface Address {
  detail: string;
  lng: number | null;
  lat: number | null;
}

export interface UserInfo {
  _id: string;
  username: string;
  address: Address;
}

export type OrderStatus =
  | "待发货"
  | "配送中"
  | "已送达"
  | "用户申请退货"
  | "商家已取消";

export interface Order {
  _id: string;
  title: string;
  price: number;
  address: Address;

  merchantId: string | UserInfo;
  userId: string | UserInfo;

  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

/* ===========================
   API BASE（你的后端地址）
=========================== */

const BASE = "https://system-backend.zeabur.app/api/orders";

/* 全局 Header */
function authHeader() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  };
}

/* ===========================
   1. 获取订单列表
=========================== */
export async function fetchOrders(): Promise<Order[]> {
  const res = await fetch(BASE, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

/* ===========================
   2. 获取单个订单
=========================== */
export async function fetchOrder(id: string): Promise<Order> {
  const res = await fetch(`${BASE}/${id}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to fetch order");
  return res.json();
}

/* ===========================
   3. 用户创建订单
=========================== */
export async function createOrder(payload: {
  title: string;
  price: number;
  address: string; // 用户输入纯文本
  merchantId: string;
}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create order");
  return res.json();
}

/* ===========================
   4. 商家发货（自动路线 + WS）
=========================== */
export async function shipOrder(id: string) {
  const res = await fetch(`${BASE}/${id}/ship`, {
    method: "PUT",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to ship order");
  return res.json();
}

/* ===========================
   5. 用户/商家 更新状态
=========================== */
/**
 * status 可为：
 * 用户：申请退货 → "用户申请退货"
 * 商家：取消订单 → "商家已取消"
 * 商家：确认送达 → "已送达"
 */
export async function updateStatus(id: string, status: OrderStatus) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update order");
  return res.json();
}

/* ===========================
   6. 删除订单（用户/商家都能删）
=========================== */
export async function deleteOrder(id: string) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to delete order");
  return res.json();
}

/* ===========================
   7. 获取路线（前端地图使用）
=========================== */
export async function getRoute(orderId: string) {
  const res = await fetch(`${BASE}/route?id=${orderId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("Failed to get route");
  return res.json();
}
