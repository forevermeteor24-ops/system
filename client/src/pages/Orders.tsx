import React, { useEffect, useState } from "react";
import {
  fetchOrders,
  createOrder,
  type Order
} from "../api/orders";

import { Link } from "react-router-dom";

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !address) return alert("请填写商品名和地址");
    setCreating(true);
    try {
      await createOrder({ title, address });
      setTitle(""); setAddress("");
      await load();
    } catch (err) {
      console.error(err);
      alert("创建订单失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h3>订单列表</h3>

      <form onSubmit={handleCreate} style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <input placeholder="商品名" value={title} onChange={e => setTitle(e.target.value)} />
        <input placeholder="收货地址" value={address} onChange={e => setAddress(e.target.value)} />
        <button type="submit" disabled={creating}>{creating ? "创建中..." : "创建订单"}</button>
        <button type="button" onClick={load}>刷新</button>
      </form>

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
                <div>地址：{o.address}</div>
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
