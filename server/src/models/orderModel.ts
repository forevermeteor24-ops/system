import mongoose from "mongoose";

export type OrderStatus =
  | "pending"
  | "shipped"
  | "delivering"
  | "delivered";

const OrderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    address: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "shipped", "delivering", "delivered"],
      default: "pending",
    },

    location: {
      lng: Number,
      lat: Number,
    },

    /** ⭐新增：用于保存轨迹进度（重启后恢复） */
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
