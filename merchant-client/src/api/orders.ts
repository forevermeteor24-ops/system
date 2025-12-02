/* ===========================================
   类型定义（匹配后端）
=========================================== */
import axios from 'axios';

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
  | "已完成"
  | "用户申请退货"
  | "商家已取消";

/** 路线点 */
export interface RoutePoint {
  lng: number;
  lat: number;
}

export interface Order {
  _id: string;
  title: string;
  price: number;          
  quantity: number;       
  totalPrice: number;     
  eta: number;            // ETA 时间戳 (ms)
  address: Address;
  merchantId: string;
  userId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;

  /** 后端推送过来的路线点数组 */
  routePoints?: RoutePoint[];

  /** 送达时间（如果已送达） */
  deliveredAt?: string;
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
  const res = await fetch(BASE, { headers: authHeader() });
  if (!res.ok) throw new Error("获取订单列表失败");
  return res.json();
}

/* ===========================
   2. 获取单个订单
=========================== */
export async function fetchOrder(id: string): Promise<Order> {
  const res = await fetch(`${BASE}/${id}`, { headers: authHeader() });
  if (!res.ok) throw new Error("获取订单失败");
  return res.json();
}

/* ===========================
   3. 用户创建订单（新增 quantity）
=========================== */
export async function createOrder(payload: {
  title: string;
  productId: string;
  merchantId: string;
  quantity: number; // 新增
  address: { detail: string; lng?: number; lat?: number };
}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("创建订单失败");
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
  if (!res.ok) throw new Error("发货请求失败");
  return res.json();
}

/* ===========================
   5. 用户/商家 更新状态
=========================== */
/**
 * status 可为：
 * 用户：申请退货 → "用户申请退货"
 * 用户：确认收货 → "已完成"
 * 商家：取消订单 → "商家已取消"
 */
export async function updateStatus(id: string, status: OrderStatus) {
  const res = await fetch(`${BASE}/${id}/status`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("更新订单状态失败");
  return res.json();
}

/* ===========================
   6. 删除订单（用户/商家）
=========================== */
export async function deleteOrder(id: string) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("删除订单失败");
  return res.json();
}

/* ===========================
   7. 请求路线（返回 points）
=========================== */
export async function requestRoute(orderId: string) {
  const url = `${BASE}/route?id=${orderId}`;
  const token = localStorage.getItem("token");
  if (!token) throw new Error("没有授权 Token");

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  
  return response.data;
}

/* ===========================
   8. 获取路线（前端地图使用）
=========================== */
export async function getRoute(orderId: string) {
  const res = await fetch(`${BASE}/route?id=${orderId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error("获取路线失败");
  return res.json();
}
