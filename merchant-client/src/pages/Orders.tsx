import React, { useEffect, useState } from "react";
import {
  fetchOrders,
  updateStatus,
  shipOrder,
  deleteOrder,
  type Order,
} from "../api/orders";
import { Link, useNavigate } from "react-router-dom";

export default function MerchantHome() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<"time" | "price">("time");

  /* -----------------------
     加载订单
  ----------------------- */
  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(sortOrders(data, sortField));
    } catch (err) {
      console.error(err);
      alert("获取订单失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------
     排序函数
  ----------------------- */
  const sortOrders = (list: Order[], field: "time" | "price") => {
    if (field === "price") {
      return [...list].sort((a, b) => a.price - b.price);
    }
    return [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );
  };

  const onSortChange = (field: "time" | "price") => {
    setSortField(field);
    setOrders(sortOrders(orders, field));
  };

  useEffect(() => {
    load();
  }, []);

  /* -----------------------
     商家操作
  ----------------------- */

  const doShip = async (id: string) => {
    if (!confirm("确认发货？路线自动规划并开始配送轨迹模拟。")) return;
    await shipOrder(id);
    load();
  };

  const doCancelByMerchant = async (id: string) => {
    if (!confirm("确认取消订单？（仅限用户申请退货）")) return;
    await updateStatus(id, "商家已取消");
    load();
  };

  const doDelete = async (id: string) => {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(id);
    load();
  };

  /* -----------------------
     渲染
  ----------------------- */
  return (
    <div style={{ padding: 20 }}>
      {/* 顶部标题 + 账户按钮 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>商家后台</h2>

        <button
          onClick={() => navigate("/merchant/profile")}
          style={{ padding: "6px 12px" }}
        >
          修改账户信息
        </button>
      </div>

      <button onClick={load} style={{ marginBottom: 10 }}>
        刷新
      </button>

      {/* 排序 */}
      <div style={{ margin: "12px 0" }}>
        排序：
        <select
          value={sortField}
          onChange={(e) => onSortChange(e.target.value as any)}
        >
          <option value="time">按创建时间（新 → 旧）</option>
          <option value="price">按价格（低 → 高）</option>
        </select>
      </div>

      {/* 订单区域 */}
      {loading ? (
        <div>加载中...</div>
      ) : orders.length === 0 ? (
        <div>暂无订单。</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orders.map((o) => (
            <div
              key={o._id}
              style={{
                padding: 12,
                borderRadius: 8,
                background: "#fff",
                boxShadow: "0 0 0 1px #eee",
              }}
            >
              {/* 顶部：标题 + 时间 */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{o.title}</strong>
                <small>{new Date(o.createdAt).toLocaleString()}</small>
              </div>

              <div style={{ marginTop: 8 }}>
                <div>价格：¥{o.price}</div>
                <div>收货地址：{o.address.detail}</div>
                <div>
                  状态：<em>{o.status}</em>
                </div>
              </div>

              {/* 按钮区域 */}
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Link to={`/orders/${o._id}`}>查看详情</Link>

                {/* 待发货 → 显示发货按钮 */}
                {o.status === "待发货" && (
                  <button onClick={() => doShip(o._id)}>发货</button>
                )}

                {/* 用户申请退货 → 商家可取消订单 */}
                {o.status === "用户申请退货" && (
                  <button onClick={() => doCancelByMerchant(o._id)}>
                    取消订单
                  </button>
                )}

                {/* 已送达 / 商家已取消 → 可以删除 */}
                {(o.status === "已送达" || o.status === "商家已取消") && (
                  <button onClick={() => doDelete(o._id)}>删除订单</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
