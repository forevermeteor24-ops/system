import React, { useState, useEffect, useRef } from "react";
import { fetchOrder, requestRoute } from "../api/orders";

declare const AMap: any;

export default function UserTrack() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  /** WebSocket 地址 */
  const WS_URL = "wss://graphics-stands-chris-map.trycloudflare.com";

  /** 点击查询订单 */
  async function queryOrder() {
    if (!orderId.trim()) {
      alert("请输入订单号");
      return;
    }

    setLoading(true);

    try {
      const o = await fetchOrder(orderId);
      setOrder(o);

      /** 等地图 DOM 挂载 */
      await new Promise<void>((resolve) => {
        const check = () =>
          mapRef.current ? resolve() : requestAnimationFrame(check);
        check();
      });

      /** ⭐加载小车动画插件（必须） */
      await new Promise<void>((resolve) => {
        AMap.plugin(["AMap.MoveAnimation"], () => resolve());
      });

      /** 初始化地图（只做一次） */
      if (!mapInstanceRef.current) {
        const map = new AMap.Map(mapRef.current, {
          zoom: 12,
          center: [116.397428, 39.90923],
        });
        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      /** 请求路线 */
      const routeRes = await requestRoute(
        "北京市海淀区中关村大街27号",
        o.address
      );

      if (routeRes?.points?.length > 0) {
        const path = routeRes.points.map((p: any) => [p.lng, p.lat]);

        /** 渲染路线 polyline */
        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 4,
          showDir: true,
        });
        map.add(polyline);
        map.setFitView();

        /** 创建小车 marker */
        const marker = new AMap.Marker({
          position: path[0],
          icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
          offset: new AMap.Pixel(-13, -30),
        });

        marker.setMap(map);
        markerRef.current = marker;

        console.log("🚗 小车已初始化", path[0]);
      }
    } catch (err) {
      console.error("❌ 查询失败：", err);
      alert("订单不存在或后端不可用");
    } finally {
      setLoading(false);
    }
  }

  /** WebSocket 实时接收位置并移动 marker */
  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => console.log("🌐 WS 已连接");
    ws.onclose = () => console.log("❌ WS 已断开");

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      /** ⭐关键：必须匹配当前订单 */
      if (
        msg.type === "location" &&
        msg.orderId === orderId &&
        markerRef.current &&
        msg.position
      ) {
        const { lng, lat } = msg.position;

        console.log("🚚 收到后端位置：", lng, lat);

        markerRef.current.moveTo([lng, lat], {
          duration: 800,
          autoRotation: true,
        });
      }
    };

    return () => ws.close();
  }, [orderId]); // ← 必须依赖订单 ID

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 16 }}>📦 物流实时追踪</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="请输入订单ID"
          style={{
            padding: "8px 12px",
            width: 260,
            marginRight: 12,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        />

        <button
          onClick={queryOrder}
          disabled={loading}
          style={{
            padding: "8px 20px",
            background: "#1677ff",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "查询中..." : "查询"}
        </button>
      </div>

      {order && (
        <div
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <p>订单ID：{order._id}</p>
          <p>收货地址：{order.address}</p>
          <p>状态：{order.status}</p>
        </div>
      )}

      <div
        ref={mapRef}
        style={{ width: "100%", height: "450px", background: "#eee" }}
      />
    </div>
  );
}
