import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchOrders } from "../api/orders";
import type { Order } from "../types/order";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchOrders();   // ✔ 自动获取当前用户的订单
        setOrders(data);
      } catch (err) {
        console.error(err);
        alert("获取订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div>加载中...</div>;

  if (orders.length === 0)
    return <div style={{ padding: 24 }}>你还没有下过订单。</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>我的订单</h2>

      {orders.map((o) => (
        <div key={o._id} style={{ padding: 8 }}>
          <Link to={`/track/${o._id}`}>
            {o.title} - {o.status}
          </Link>
        </div>
      ))}
    </div>
  );
}
