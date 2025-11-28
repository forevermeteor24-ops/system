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

export type OrderStatus = "pending" | "shipped" | "delivering" | "delivered";

export interface TrackState {
  index: number;
  total: number;
  lastPosition: {
    lng: number | null;
    lat: number | null;
  };
}

export interface Order {
  _id: string;
  title: string;
  address: Address;

  merchantId: UserInfo;
  userId: UserInfo;

  price: number;          // ← 你后端必须有
  status: OrderStatus;

  trackState: TrackState; // ← 后端有这个字段

  createdAt: string;
  updatedAt: string;
}
