import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, requestRoute } from "../api/orders";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const routePointsRef = useRef<any[]>([]);
  const routeLoadedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const wsReadyRef = useRef(false);

  // 初始化地图和路线
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      const o = await fetchOrder(id);
      if (!mounted) return;
      setOrder(o);

      // 等待 DOM
      await new Promise<void>((resolve) => {
        const wait = () =>
          mapRef.current ? resolve() : requestAnimationFrame(wait);
        wait();
      });

      // 初始化地图
      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current, {
          zoom: 12,
          center: [116.407387, 39.904179],
        });
      mapInstanceRef.current = map;

      // 获取路线
      const res = await requestRoute("北京市", o.address);

      if (res?.points?.length > 0) {
        routePointsRef.current = res.points;
        routeLoadedRef.current = true;

        const path = res.points.map((p: any) => [p.lng, p.lat]);

        map.add(
          new AMap.Polyline({
            path,
            strokeWeight: 4,
            showDir: true,
          })
        );

        map.setFitView();

        // Add marker
        const marker = new AMap.Marker({
          position: path[0],
          icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
        });
        marker.setMap(map);
        markerRef.current = marker;
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  // WebSocket + 恢复位置
  useEffect(() => {
    if (!order) return;
    if (order.status !== "shipped") return;
    if (!routeLoadedRef.current) return;

    const ws = new WebSocket("wss://graphics-stands-chris-map.trycloudflare.com");
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🌐 WS 已连接");
      wsReadyRef.current = true;

      // 关键：刷新后请求当前状态
      ws.send(
        JSON.stringify({
          type: "request-current",
          orderId: order._id,
        })
      );
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      // 小车实时位置
      if (msg.type === "location") {
        const pos = msg.position;
        if (markerRef.current && pos) {
          markerRef.current.setPosition([pos.lng, pos.lat]);
        }
        return;
      }

      // 后端返回当前进度（刷新页面专用）
      if (msg.type === "current-state") {
        console.log("📌 收到 current-state:", msg);

        if (markerRef.current && msg.position) {
          markerRef.current.setPosition([msg.position.lng, msg.position.lat]);
        }

        // 然后继续播放轨迹
        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePointsRef.current,
          })
        );

        return;
      }

      if (msg.type === "no-track") {
        console.log("ℹ 没有正在播放的轨迹，准备启动新的");

        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePointsRef.current,
          })
        );
      }
    };

    ws.onerror = (e) => console.error("WS 错误", e);
    ws.onclose = () => console.log("❌ WS 已关闭");

    return () => ws.close();
  }, [order?.status, routeLoadedRef.current]);

  return (
    <div>
      <h3>订单详情</h3>
      <p>订单ID：{order?._id}</p>
      <p>地址：{order?.address}</p>
      <p>状态：{order?.status}</p>

      <div ref={mapRef} style={{ height: 420, marginTop: 16 }} />
    </div>
  );
}
