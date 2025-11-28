import { useState } from "react";
import http from "../api/http";

export default function CreateOrder() {
  const [merchantId, setMerchantId] = useState("");
  const [title, setTitle] = useState("");       // 商品名称
  const [address, setAddress] = useState("");   // 地址

  const create = async () => {
    if (!merchantId || !title || !address) {
      alert("商家ID、商品名称、地址都是必填的！");
      return;
    }

    await http.post("/orders", {
      merchantId,
      title,        // ⭐ 商品名称传给后端
      address       // ⭐ 地址传给后端（后端会自动格式化）
    });

    alert("订单创建成功");
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>创建订单</h2>

      {/* 商家ID */}
      <input
        placeholder="商家 ID"
        value={merchantId}
        onChange={(e) => setMerchantId(e.target.value)}
      />
      <br />

      {/* 商品名称 */}
      <input
        placeholder="商品名称（title）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <br />

      {/* 地址 */}
      <input
        placeholder="收货地址"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <br />

      <button onClick={create}>创建订单</button>
    </div>
  );
}
