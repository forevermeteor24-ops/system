import mongoose from "mongoose";

export type OrderStatus = "pending" | "shipped" | "delivering" | "delivered";

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
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);
export default Order;
