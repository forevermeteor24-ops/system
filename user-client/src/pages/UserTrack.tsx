import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, requestRoute } from "../api/orders";

declare const AMap: any;

export default function UserTrack() {
  const { id: orderId } = useParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const WS_URL = "wss://system-backend.zeabur.app";

  /** -------------------------------
   * 初始化：查询订单 + 加载路线
   -------------------------------- */
  useEffect(() => {
    if (!orderId) return;

    (async () => {
      setLoading(true);
      try {
        /** 1. 获取订单 */
        const o = await fetchOrder(orderId);
        setOrder(o);

        /** 等待 DOM */
        await new Promise<void>((resolve) => {
          const wait = () =>
            mapRef.current ? resolve() : requestAnimationFrame(wait);
          wait();
        });

        /** 加载移动插件 */
        await new Promise<void>((resolve) => {
          AMap.plugin(["AMap.MoveAnimation"], () => resolve());
        });

        /** 2. 初始化地图 */
        if (!mapInstanceRef.current) {
          const map = new AMap.Map(mapRef.current!, {
            zoom: 14,
            center: [
              o.merchantId.address.lng,
              o.merchantId.address.lat,
            ],
          });
          mapInstanceRef.current = map;
        }

        const map = mapInstanceRef.current;
        map.clearMap();

        /** 3. 请求后端的路线（⚠️ 只需要传 orderId） */
        const routeRes = await requestRoute(orderId);

        if (routeRes?.points?.length > 0) {
          const path = routeRes.points.map((p: any) => [p.lng, p.lat]);

          /** 绘制路线 */
          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 4,
            showDir: true,
          });
          map.add(polyline);
          map.setFitView();

          /** 初始化小车 */
          const marker = new AMap.Marker({
            position: path[0],
            icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
            offset: new AMap.Pixel(-13, -30),
          });
          marker.setMap(map);

          markerRef.current = marker;
          console.log("🚗 用户端小车初始化完成");
        }
      } catch (err) {
        console.error("❌ 获取订单失败", err);
        alert("无法获取订单信息");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  /** WebSocket 监听实时位置 */
  useEffect(() => {
    if (!orderId) return;

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => console.log("🌐 WS 已连接（用户端）");
    ws.onclose = () => console.log("❌ WS 已断开");

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (
        msg.type === "location" &&
        msg.orderId === orderId &&
        msg.position &&
        markerRef.current
      ) {
        const { lng, lat } = msg.position;

        markerRef.current.moveTo([lng, lat], {
          duration: 800,
          autoRotation: true,
        });
      }
    };

    return () => ws.close();
  }, [orderId]);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 12 }}>🚚 用户端 · 实时配送轨迹</h2>

      {loading && <div>加载中...</div>}

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
          <p>商品：{order.title}</p>
          <p>收货地址：{order.address.detail}</p>
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
