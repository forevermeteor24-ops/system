import React, { useEffect, useState } from "react";
import { fetchOrders, type Order } from "../api/orders";
import { Link } from "react-router-dom";

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error(err);
      alert("获取订单失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h3>订单列表（商家端）</h3>

      <button onClick={load}>刷新</button>

      {loading ? (
        <div>加载中...</div>
      ) : orders.length === 0 ? (
        <div>目前没有订单。</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orders.map(o => (
            <div key={o._id} style={{ padding: 12, borderRadius: 8, background: "#fff", boxShadow: "0 0 0 1px #eee" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>{o.title}</strong>
                <small>{new Date(o.createdAt).toLocaleString()}</small>
              </div>

              <div style={{ marginTop: 8 }}>
                <div>地址：{o.address.detail}</div>
                <div>状态：<em>{o.status}</em></div>
              </div>

              <div style={{ marginTop: 10 }}>
                <Link to={`/orders/${o._id}`}>查看详情</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
