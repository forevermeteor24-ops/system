import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchOrders } from "../api/orders";
import type { Order } from "../types/order";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState("time_desc"); // 默认：时间 新→旧

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchOrders(); // 后端根据 token 返回当前用户订单
        setOrders(data);
      } catch (err) {
        console.error(err);
        alert("获取订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** 排序逻辑 */
  const sortedOrders = [...orders].sort((a, b) => {
    if (sort === "time_desc") return +new Date(b.createdAt) - +new Date(a.createdAt);
    if (sort === "time_asc") return +new Date(a.createdAt) - +new Date(b.createdAt);

    if (sort === "price_desc") return (b.price || 0) - (a.price || 0);
    if (sort === "price_asc") return (a.price || 0) - (b.price || 0);

    return 0;
  });

  if (loading) return <div>加载中...</div>;

  if (orders.length === 0)
    return <div style={{ padding: 24 }}>你还没有下过订单。</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>我的订单</h2>

      {/* 排序下拉框 */}
      <div style={{ margin: "12px 0" }}>
        <label>排序方式： </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ padding: 6, borderRadius: 6 }}
        >
          <option value="time_desc">按创建时间（最新优先）</option>
          <option value="time_asc">按创建时间（最早优先）</option>
          <option value="price_desc">按价格（高到低）</option>
          <option value="price_asc">按价格（低到高）</option>
        </select>
      </div>

      {/* 订单列表 */}
      {sortedOrders.map((o) => (
        <div
          key={o._id}
          style={{
            padding: "12px 0",
            borderBottom: "1px solid #eee",
          }}
        >
          <Link to={`/track/${o._id}`} style={{ fontSize: 16 }}>
            <b>{o.title}</b>
          </Link>

          <div style={{ fontSize: 14, color: "#888" }}>
            状态：{o.status}  
            <br />
            价格：{o.price} 元
            <br />
            创建时间：{new Date(o.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
