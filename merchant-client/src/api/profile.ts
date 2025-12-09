// profile.ts
import type { Address } from "./orders";

export interface Profile {
  _id: string;
  username: string;
  phone?: string;
  role: "user" | "merchant";
  address: Address;
  
  // ⭐ 新增：配送范围字段 (后端 User 模型中定义的结构)
  deliveryZone?: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

/* API 地址配置 */
const API_ROOT = "https://system-backend.zeabur.app/api";
const AUTH_URL = `${API_ROOT}/auth/me`;
const MERCHANT_URL = `${API_ROOT}/merchants`;

function authHeader() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  };
}

/* 获取当前用户信息 */
export async function fetchProfile(): Promise<Profile> {
  const res = await fetch(AUTH_URL, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

/* 更新当前用户信息 (基础信息：名字、电话、地址) */
export async function updateProfile(payload: {
  username?: string;
  phone?: string;
  address?: {
    detail: string;
    lng: number | null;
    lat: number | null;
  };
}) {
  const res = await fetch(AUTH_URL, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

/* ⭐ 新增：单独保存配送范围 */
export async function saveDeliveryZone(coordinates: number[][][]) {
  // 对应后端路由: router.put('/delivery-zone', ...)
  // 完整路径: /api/merchant/delivery-zone
  const res = await fetch(`${MERCHANT_URL}/delivery-zone`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify({ coordinates }),
  });

  if (!res.ok) {
    // 尝试获取后端具体的错误信息
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || "保存配送范围失败");
  }
  
  return res.json();
}