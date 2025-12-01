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

export interface Order {
  _id: string;
  title: string;
  price: number;          // 单价
  quantity: number;       // 数量
  totalPrice: number;     // 总价 = price * quantity
  eta:number;
  address: Address;
  merchantId: string;
  userId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}