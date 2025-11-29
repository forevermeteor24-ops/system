import mongoose from "mongoose";

export type OrderStatus =
  | "待发货"
  | "配送中"
  | "已送达"
  | "用户申请退货"
  | "商家已取消";

/** 地址结构 */
const AddressSchema = new mongoose.Schema(
  {
    detail: { type: String, required: true },
    lng: { type: Number },
    lat: { type: Number },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },

    /** 地址对象 */
    address: { type: AddressSchema, required: true },

    /** 商家 */
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /** 下单用户 */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /** 商品价格 */
    price: { type: Number, required: true },

    /** 中文订单状态 */
    status: {
      type: String,
      enum: [
        "待发货",
        "配送中",
        "已送达",
        "用户申请退货",
        "商家已取消",
      ],
      default: "待发货",
    },

    /** 轨迹进度（重启恢复） */
    trackState: {
      index: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      lastPosition: {
        lng: Number,
        lat: Number,
      },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);
export default Order;
