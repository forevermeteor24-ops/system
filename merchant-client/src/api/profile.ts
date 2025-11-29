// profile.ts
import type { Address } from "./orders";


export interface Profile {
  _id: string;
  username: string;
  role: "user" | "merchant";
  address: Address;
}

const BASE = "https://system-backend.zeabur.app/api/auth/me";

function authHeader() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  };
}

/* 获取当前用户信息 */
export async function fetchProfile(): Promise<Profile> {
  const res = await fetch(BASE, { headers: authHeader() });
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

/* 更新当前用户信息 */
export async function updateProfile(payload: {
  username?: string;
  address?: {
    detail: string;
    lng: number | null;
    lat: number | null;
  };
}) {
  const res = await fetch(BASE, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}
