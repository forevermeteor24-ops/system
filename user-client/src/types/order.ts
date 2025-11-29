/* 地址结构 */
export interface Address {
  detail: string;
  lng: number | null;
  lat: number | null;
}

/* 用户信息 */
export interface UserInfo {
  _id: string;
  username: string;
  address: Address;
}

/* 订单状态（中文） */
export type OrderStatus =
  | "待发货"
  | "配送中"
  | "已送达"
  | "用户申请退货"
  | "商家已取消";

/* 后端已存在 trackState 字段（保持可选） */
export interface TrackState {
  index: number;
  total: number;
  lastPosition: {
    lng: number | null;
    lat: number | null;
  };
}

/* 订单结构 */
export interface Order {
  _id: string;
  title: string;
  price: number;

  address: Address;

  merchantId: UserInfo;
  userId: UserInfo;

  status: OrderStatus;

  trackState?: TrackState;

  createdAt: string;
  updatedAt: string;
}
