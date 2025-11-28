import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchOrder } from "../api/orders";
import type { Order } from "../types/order";

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const o = await fetchOrder(id);
        setOrder(o);
      } catch (err) {
        console.error(err);
        alert("获取订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div style={{ padding: 20 }}>加载中...</div>;
  if (!order) return <div style={{ padding: 20 }}>订单不存在</div>;

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 12 }}>订单详情</h2>

      <div
        style={{
          padding: 16,
          borderRadius: 8,
          border: "1px solid #ddd",
          marginBottom: 20,
          background: "#fff",
          maxWidth: 500,
        }}
      >
        <p><strong>订单号：</strong> {order._id}</p>
        <p><strong>商品名：</strong> {order.title}</p>
        <p><strong>收货地址：</strong> {order.address.detail}</p>

        <p><strong>商家：</strong> {order.merchantId?.username}</p>
        <p><strong>用户：</strong> {order.userId?.username}</p>

        <p>
          <strong>状态：</strong> 
          <span style={{ color: "#1677ff" }}>{order.status}</span>
        </p>

        <p><strong>创建时间：</strong> {new Date(order.createdAt).toLocaleString()}</p>
        <p><strong>更新时间：</strong> {new Date(order.updatedAt).toLocaleString()}</p>

        {/* 查看物流按钮 */}
        <Link
          to={`/track/${order._id}`}
          style={{
            display: "inline-block",
            marginTop: 16,
            background: "#1677ff",
            padding: "8px 18px",
            borderRadius: 6,
            color: "white",
            textDecoration: "none",
          }}
        >
          查看实时物流轨迹 →
        </Link>
      </div>

      <Link to="/" style={{ color: "#1677ff" }}>
        ← 返回我的订单
      </Link>
    </div>
  );
}
