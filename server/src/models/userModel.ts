import mongoose, { Document } from "mongoose";

export interface Address {
  detail: string;
  lng: number;
  lat: number;
}

export interface UserDocument extends Document {
  username: string;
  password: string;
  role: "merchant" | "user";
  address: Address;

  phone: string;   // ⭐ 新增电话号码
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["merchant", "user"], required: true },

    phone: { type: String },  // ⭐ 新增字段

    address: {
      detail: String,
      lng: Number,
      lat: Number,
    },
  },
  { timestamps: true }
);

export default mongoose.model<UserDocument>("User", userSchema);
