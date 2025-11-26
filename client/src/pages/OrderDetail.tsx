import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, requestRoute } from "../api/orders";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);

  // ---- 将 routePoints & routeLoaded 用 state 管理（修复：ref 不会触发 effect） ----
  const [routePoints, setRoutePoints] = useState<{ lng: number; lat: number }[]>(
    []
  );
  const [routeLoaded, setRouteLoaded] = useState(false);

  const [fitViewDone, setFitViewDone] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const wsRef = useRef<WebSocket | null>(null);

  /** ---------------------------
   * 初始化地图 & 加载路线
   --------------------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const o = await fetchOrder(id);
      if (!mounted) return;

      setOrder(o);

      // 等 DOM 挂载（保持你原来的等待策略）
      await new Promise<void>((resolve) => {
        const wait = () =>
          mapRef.current ? resolve() : requestAnimationFrame(wait);
        wait();
      });

      // 初始化地图（复用实例）
      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current, {
          zoom: 13,
          center: new AMap.LngLat(116.407387, 39.904179),
        });

      mapInstanceRef.current = map;

      // 获取路线（使用你的后端接口）
      const res = await requestRoute("北京市", o.address);

      if (res?.points?.length > 0) {
        // 使用 state 存储点（替代 ref）
        setRoutePoints(res.points);
        setRouteLoaded(true);

        // 构建 AMap 点数组
        const path = res.points.map((p: any) => new AMap.LngLat(p.lng, p.lat));

        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 4,
          showDir: true,
        });

        map.add(polyline);

        // 只 fitView 一次（用 state 控制）
        if (!fitViewDone) {
          try {
            map.setFitView([polyline]);
          } catch (e) {
            // 有时 setFitView 在某些容器尺寸变化时会报错或出问题，捕获以免阻塞后续逻辑
            console.warn("setFitView failed:", e);
          }
          setFitViewDone(true);
        }

        // 初始小车位置：为 icon 指定合适的 offset（避免缩放/重绘时“偏移”）
        // 请根据你的图标实际尺寸调整 offset 数值（下面示例假设图标宽约26 高约30）
        const iconUrl = "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png";
        const assumedIconWidth = 26;
        const assumedIconHeight = 30;

        const marker = new AMap.Marker({
          position: path[0],
          icon: iconUrl,
          // 使图标底部中心对齐坐标点（负值向左/向上移动）
          offset: new AMap.Pixel(-assumedIconWidth / 2, -assumedIconHeight),
          // 不要在每次更新时自动改变地图视角
          // autoRotation: false, // 若有此选项可考虑
        });

        map.add(marker);
        markerRef.current = marker;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /** ---------------------------------
   * WebSocket：实时轨迹 & 刷新恢复
   *
   * 重要修改：
   * - 依赖 routeLoaded（state）而不是 ref.current，确保路线加载完后 effect 会运行
   * - 初始化后发送 request-current；处理 current-state / location / no-track
   * --------------------------------- */
  useEffect(() => {
    if (!order) return;
    if (order.status !== "shipped") return;
    if (!routeLoaded) return;
    if (!routePoints || routePoints.length === 0) return;

    const ws = new WebSocket("wss://patches-pope-paris-promised.trycloudflare.com");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          orderId: order._id,
        })
      );
    
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

      // 实时位置更新（后端发送位置）
      if (msg.type === "location" && msg.position) {
        // 只更新 marker 的位置，**不要**每次都调整地图视角（避免跳动）
        if (markerRef.current) {
          // 使用数组或 LngLat 均可
          markerRef.current.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
        }
        return;
      }

      // 刷新恢复（首次进入）
      if (msg.type === "current-state") {
        if (markerRef.current && msg.position) {
          markerRef.current.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
        }

        // 已到终点则不继续播放
        if (msg.index >= msg.total - 1) return;

        // 正常继续播放（将完整轨迹发给后端，后端开始播放）
        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePoints,
          })
        );
        return;
      }

      // 后端没有轨迹（第一次打开）
      if (msg.type === "no-track") {
        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePoints,
          })
        );
      }
    };

    ws.onerror = (e) => {
      console.warn("WS error", e);
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [order?.status, routeLoaded, routePoints, order?._id]);

  /** -----------------------
   * （可选）平滑移动
   *
   * 如果你觉得 marker 每次瞬移很僵硬，可以在收到新位置时对上一次位置与下一位置之间插值，
   * 循序调用 marker.setPosition(..) 以获得平滑移动效果。下面为思路（示例，不在默认执行）：
   *
   * function smoothMove(marker, fromLngLat, toLngLat, steps = 8, interval = 40) {
   *   // 线性插值
   *   for (let i = 1; i <= steps; i++) {
   *     setTimeout(() => {
   *       const t = i / steps;
   *       const lng = fromLngLat.lng + (toLngLat.lng - fromLngLat.lng) * t;
   *       const lat = fromLngLat.lat + (toLngLat.lat - fromLngLat.lat) * t;
   *       marker.setPosition(new AMap.LngLat(lng, lat));
   *     }, i * interval);
   *   }
   * }
   *
   * 使用方法：在收到 msg.position 时，用上一次位置（记录在 ref）和当前位置调用 smoothMove。
   * 注意控制并发（不要在上一次动画未结束时又发起新动画）。
   *
   * ----------------------- */

  return (
    <div>
      <h3>订单详情</h3>

      <p>订单ID：{order?._id}</p>
      <p>地址：{order?.address}</p>
      <p>状态：{order?.status}</p>

      <div
        ref={mapRef}
        style={{ height: 420, marginTop: 16, borderRadius: 8 }}
      />
    </div>
  );
}
