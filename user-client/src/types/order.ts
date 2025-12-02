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
