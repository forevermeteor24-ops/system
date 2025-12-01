// server/src/models/orderModel.ts
import mongoose from "mongoose";

export type OrderStatus =
  | "待发货"
  | "配送中"
  | "已送达"
  | "已完成"
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

const TrackPointSchema = new mongoose.Schema(
  {
    lng: Number,
    lat: Number,
    timestamp: { type: Number }, // 可选：记录点生成时间
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

    /** 商品单价（后端保存） */
    price: { type: Number, required: true },

    /** 商品数量 */
    quantity: { type: Number, required: true, default: 1 },

    /** 总价（price * quantity，后端计算） */
    totalPrice: { type: Number, required: true },

    /** 路线点（planning 生成并保存在订单中） */
    routePoints: { type: [TrackPointSchema], default: [] },

    /** ETA（以时间戳 ms 存储，表示预计到达时间） */
    eta: { type: Number, default: null },

    /** 中文订单状态 */
    status: {
      type: String,
      enum: [
        "待发货",
        "配送中",
        "已送达",
        "已完成",
        "用户申请退货",
        "商家已取消",
      ],
      default: "待发货",
    },

    /** 轨迹进度（重启恢复） */
    trackState: {
      index: { type: Number, default: 0 }, // 已走到第几个点
      total: { type: Number, default: 0 }, // 总点数
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
