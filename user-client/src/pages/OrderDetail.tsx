// src/pages/OrderDetail.tsx
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, deleteOrder } from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [markerReady, setMarkerReady] = useState(false); // 标记 marker 是否就绪
  const [routePoints, setRoutePoints] = useState<any[]>([]);

  /* ---------------- 获取订单数据 & 初始化地图 & 绘制路线 ---------------- */
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 等 DOM 挂载出 map 容器
        await new Promise<void>((resolve) => {
          const wait = () => (mapRef.current ? resolve() : requestAnimationFrame(wait));
          wait();
        });

        // 初始化地图（只初始化一次）
        const map =
          mapInstanceRef.current ||
          new AMap.Map(mapRef.current!, {
            zoom: 12,
            center: [121.47, 31.23],
            // 其他你需要的 map 配置
          });
        mapInstanceRef.current = map;

        // 尝试提前加载 MoveAnimation 插件（可选）
        try {
          map.plugin && map.plugin(["AMap.MoveAnimation"], () => {
            console.log("AMap.MoveAnimation loaded");
          });
        } catch (e) {
          // ignore
        }

        // 读取后端的 routePoints（防护 null/undefined）
        const points = o.routePoints ?? [];
        setRoutePoints(points);

        if (points.length > 1) {
          const path = points.map((p: any) => new AMap.LngLat(p.lng, p.lat));

          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 4,
            strokeColor: "#1677ff",
            showDir: true,
          });
          map.add(polyline);
          map.setFitView([polyline]);

          // 小车图标（换成真实车辆图标）
          const carIcon = new AMap.Icon({
            size: new AMap.Size(48, 32),
            image: "https://cdn-icons-png.flaticon.com/512/744/744465.png", // 可替换为你自己的车图标
            imageSize: new AMap.Size(48, 32),
          });

          const startPos = path[0];
          const endPos = path[path.length - 1];

          const marker = new AMap.Marker({
            position: o.status === "已送达" ? endPos : startPos,
            icon: carIcon,
            offset: new AMap.Pixel(-24, -16),
            autoRotation: true,
          });

          map.add(marker);
          markerRef.current = marker;
          setMarkerReady(true);
        } else {
          // 若没有轨迹点，只把 marker 放到地址经纬（若有）
          if (o.address?.lng && o.address?.lat) {
            const pos = new AMap.LngLat(o.address.lng, o.address.lat);
            const carIcon = new AMap.Icon({
              size: new AMap.Size(48, 32),
              image: "https://cdn-icons-png.flaticon.com/512/744/744465.png",
              imageSize: new AMap.Size(48, 32),
            });
            const marker = new AMap.Marker({
              position: pos,
              icon: carIcon,
              offset: new AMap.Pixel(-24, -16),
              autoRotation: true,
            });
            map.add(marker);
            markerRef.current = marker;
            setMarkerReady(true);
            map.setCenter(pos);
          } else {
            setMarkerReady(false);
          }
        }
      } catch (err) {
        console.error("fetchOrder failed", err);
        alert("订单获取失败");
        navigate("/orders");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ---------------- WebSocket: 订阅并平滑移动小车 ---------------- */
  useEffect(() => {
    // 只有在 order 存在、状态为配送中、以及 marker 已创建时才建立 WS 并订阅
    if (!order || order.status !== "配送中") return;
    if (!markerReady) {
      // marker 未就绪，等 markerReady 变为 true 时重试
      return;
    }

    // 关闭之前的 ws（如果有）
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    // 使用 wss 正式地址（与你后端一致）
    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    // 当连接成功，订阅订单并请求当前状态
    ws.onopen = () => {
      console.log("WS 已连接");

      // 订阅该订单
      try {
        ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
        ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
      } catch (e) {
        console.warn("ws.send failed", e);
      }
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      // 支持后端两种消息类型：'current-state' | 'location'
      // 后端 message 里： position: { lng, lat }, delay?（ms）
      if ((msg.type === "current-state" || msg.type === "location") && msg.position) {
        const pos = msg.position;
        if (!pos.lng || !pos.lat) return;

        const newPos = new AMap.LngLat(pos.lng, pos.lat);

        // 优先使用 moveTo（需要 MoveAnimation 插件），否则回退到 setPosition（突兀）
        try {
          if (typeof markerRef.current.moveTo === "function") {
            // duration 使用后端提供的 delay（毫秒）或默认 1000ms
            const duration = msg.delay && Number(msg.delay) > 0 ? Number(msg.delay) : 1000;
            markerRef.current.moveTo(newPos, { duration, autoRotation: true });
          } else {
            // 没有 moveTo 方法（插件未加载），直接设置位置
            markerRef.current.setPosition(newPos);
          }
        } catch (e) {
          // 兼容性容错：如果 moveTo 报错，回退到 setPosition
          try {
            markerRef.current.setPosition(newPos);
          } catch {}
        }
      }

      // 如果后端返回了 index / total / finished，可以更新本地 order（可选）
      if (msg.type === "location" && typeof msg.index === "number") {
        // 可根据需要更新进度、ETA 等（此处简单记录）
        // e.g. if (msg.finished) { /* do something */ }
      }
    };

    ws.onerror = (err) => {
      console.error("WS 出错", err);
    };

    ws.onclose = () => {
      console.log("WS 关闭");
    };

    // 清理
    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
    // 注意：故意不把 markerRef.current 放到依赖里 — 使用 markerReady 控制
  }, [order?.status, order?._id, markerReady]);

  /* ---------------- 剩余时间（eta）显示更新 ----------------
     假设后端在 order.eta 中写入的是到达的时间戳（毫秒）
  -------------------- */
  useEffect(() => {
    if (!order || !order.eta) {
      setRemainingTime("--");
      return;
    }

    const update = () => {
      // formatRemainingETA 接受时间戳（毫秒）或可转换的值
      try {
        setRemainingTime(formatRemainingETA(order.eta));
      } catch {
        setRemainingTime("--");
      }
    };

    update(); // 立即更新一次
    const timer = setInterval(update, 60_000); // 每分钟刷新一次
    return () => clearInterval(timer);
  }, [order?.eta]);

  /* ---------------- 操作：确认收货 / 删除 ---------------- */
  async function confirmReceive() {
    if (!order) return;
    try {
      await updateStatus(order._id, "已完成");
      setOrder({ ...order, status: "已完成" });
      alert("确认收货成功");
    } catch (e) {
      console.error(e);
      alert("确认收货失败");
    }
  }

  async function handleDelete() {
    if (!order) return;
    if (!confirm("确认删除订单？")) return;
    try {
      // 只有允许删除的状态才会显示按钮（前端也进行二次确认）
      await deleteOrder(order._id);
      alert("订单已删除");
      navigate("/orders");
    } catch (e) {
      console.error(e);
      alert("删除订单失败");
    }
  }

  /* ---------------- 时间轴 ---------------- */
  const timeLine = [
    { key: "待发货", title: "待发货", desc: "商家正在准备发货" },
    { key: "配送中", title: "配送中", desc: "配送中，请保持电话畅通" },
    { key: "已送达", title: "已送达", desc: "包裹已送达", time: order?.deliveredAt },
    { key: "已完成", title: "已完成", desc: "订单已完成" },
  ];

  const activeIndex = order ? Math.max(0, timeLine.findIndex((i) => i.key === order.status)) : -1;

  /* ---------------- 样式 ---------------- */
  const layout: React.CSSProperties = {
    display: "flex",
    gap: 20,
    minHeight: "100vh", // 改用 minHeight，避免裁切
    padding: 20,
    boxSizing: "border-box",
    alignItems: "flex-start",
  };

  const left: React.CSSProperties = {
    width: "55%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    maxHeight: "calc(100vh - 40px)",
  };

  const right: React.CSSProperties = {
    width: "45%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  };

  const card: React.CSSProperties = {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  };

  /* ---------------- render ---------------- */
  return (
    <div style={layout}>
      {/* 左侧：订单详情 + 时间线 */}
      <div style={left}>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>订单详情</h2>
          {!order ? (
            <p>加载中...</p>
          ) : (
            <>
              <p>商品：{order.title}</p>
              <p>数量：{order.quantity}</p>
              <p>单价：¥{order.price}</p>
              <p>总价：¥{order.totalPrice ?? order.price * order.quantity}</p>

              <p>剩余时间：<b>{remainingTime}</b></p>

              <p>地址：{order.address?.detail ?? "—"}</p>

              <p>
                状态： <span style={{ color: "#1677ff", fontWeight: 700 }}>{order.status}</span>
              </p>

              {/* 仅在已送达时显示确认收货 */}
              {order.status === "已送达" && (
                <button
                  onClick={confirmReceive}
                  style={{
                    background: "#1677ff",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: "pointer",
                    marginRight: 8,
                  }}
                >
                  确认收货
                </button>
              )}

              {/* 仅在已完成或商家已取消时显示删除 */}
              {(order.status === "已完成" || order.status === "商家已取消") && (
                <button
                  onClick={handleDelete}
                  style={{
                    background: "#ff4d4f",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: "pointer",
                    marginTop: 8,
                  }}
                >
                  删除订单
                </button>
              )}
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <Link to="/orders" style={{ color: "#1677ff" }}>← 返回订单列表</Link>
          </div>
        </div>

        {/* 时间线卡片 */}
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>物流状态</h3>

          {timeLine.map((item, idx) => {
            const active = idx <= activeIndex;
            return (
              <div key={item.key} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 12,
                      background: active ? "#1677ff" : "#ccc",
                      boxShadow: active ? "0 0 6px rgba(22,119,255,0.15)" : "none",
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, color: active ? "#1677ff" : "#333" }}>{item.title}</div>
                    <div style={{ color: "#666", marginTop: 6 }}>{item.desc}</div>
                    {item.time && <div style={{ color: "#999", marginTop: 6 }}>{new Date(item.time).toLocaleString()}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧：地图 */}
      <div style={right}>
        <div
          ref={mapRef}
          style={{
            width: "92%",
            height: 420,
            borderRadius: 12,
            border: "1px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}
