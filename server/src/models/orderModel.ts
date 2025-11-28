import mongoose from "mongoose";

export type OrderStatus =
  | "pending"
  | "shipped"
  | "delivering"
  | "delivered";

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

    /** ⭐地址从 String → 对象 */
    address: { type: AddressSchema, required: true },

    /** ⭐订单所属商家 */
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    /** ⭐下单用户 */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "shipped", "delivering", "delivered"],
      default: "pending",
    },

    /** ⭐轨迹进度（重启恢复） */
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
