import React, { useEffect, useState } from "react";
import * as echarts from "echarts";

// ----------- 类型定义 ----------- 
type HeatPoint = [number, number, number];  // x, y, value
type DeliveryStats = { avgDeliveryTime: number; totalDelivered: number; };
type AbnormalOrder = { _id: string; title: string; eta: number; };

// 后端 API 地址
const BASE = "https://system-backend.zeabur.app";

export default function Dashboard() {
  const [heatmap, setHeatmap] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // 请求数据
  useEffect(() => {
    async function loadData() {
      try {
        console.log("开始请求数据...");
        const token = localStorage.getItem("token");
        if (!token) {
          console.error("Token 不存在，请重新登录");
          return;
        }

        const headers = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        };

        // 请求热力图数据
        console.log("请求热力图数据...");
        const heatRes = await fetch(`${BASE}/api/dashboard/heatmap`, { headers });
        console.log("热力图数据返回:", heatRes);
        
        if (!heatRes.ok) {
          console.error("请求热力图数据失败", heatRes.status);
        } else {
          const heatData = await heatRes.json();
          console.log("热力图数据：", heatData);
          setHeatmap(heatData.points || []);
        }

        // 请求配送时效数据
        console.log("请求配送时效...");
        const statRes = await fetch(`${BASE}/api/dashboard/delivery-stats`, { headers });
        console.log("配送时效数据返回:", statRes);
        
        if (!statRes.ok) {
          console.error("请求配送时效数据失败", statRes.status);
        } else {
          const stats = await statRes.json();
          console.log("配送时效数据：", stats);
          setDeliveryStats(stats);
        }

        // 请求异常订单数据
        console.log("请求异常订单...");
        const abnRes = await fetch(`${BASE}/api/dashboard/abnormal-orders`, { headers });
        console.log("异常订单数据返回:", abnRes);
        
        if (!abnRes.ok) {
          console.error("请求异常订单数据失败", abnRes.status);
        } else {
          const abnormal = await abnRes.json();
          console.log("异常订单数据：", abnormal);
          setAbnormalOrders(abnormal.abnormal || []);
        }
        
      } catch (err) {
        console.error("Dashboard 加载失败", err);
      }

      setLoading(false);  // 数据加载完成，关闭加载状态
    }

    loadData();
  }, []); // 空依赖数组，确保只在组件挂载时执行一次

  // 渲染热力图
  useEffect(() => {
    if (!heatmap.length) return;

    const el = document.getElementById("heatmap");
    if (!el) return;

    const chart = echarts.init(el);

    chart.setOption({
      title: { text: "订单区域热力图" },
      tooltip: {},
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      visualMap: {
        min: 0,
        max: Math.max(...heatmap.map(p => p[2]), 10),
        calculable: true,
        left: "left",
        bottom: "5%",
      },
      series: [
        {
          type: "heatmap",
          data: heatmap,
          coordinateSystem: "cartesian2d",
        },
      ],
    });

    return () => chart.dispose();
  }, [heatmap]);  // 只有 heatmap 变化时才重新渲染

  if (loading) {
    return <p style={{ padding: 20 }}>加载中...</p>;  // 加载时显示的提示
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>物流数据可视化看板</h1>

      {/* ------------ 热力图区域 ------------ */}
      <div
        id="heatmap"
        style={{
          width: "100%",
          height: 400,
          marginTop: 30,
          background: "#fafafa",
          border: "1px solid #eee",
        }}
      ></div>

      {/* ------------ 配送时效 ------------ */}
      <div style={{ marginTop: 50 }}>
        <h2>平均配送时效</h2>
        {deliveryStats ? (
          <>
            <p>
              平均配送时长：<b>{Math.round(deliveryStats.avgDeliveryTime / 60000)}</b> 分钟
            </p>
            <p>已送达数量：{deliveryStats.totalDelivered}</p>
          </>
        ) : (
          <p>暂无数据</p>
        )}
      </div>

      {/* ------------ 异常订单 ------------ */}
      <div style={{ marginTop: 50 }}>
        <h2>异常订单（超时配送）</h2>

        {abnormalOrders.length === 0 && <p>暂无异常订单</p>}

        <ul>
          {abnormalOrders.map((o) => (
            <li key={o._id} style={{ marginBottom: 10 }}>
              {o.title} - ETA: {new Date(o.eta).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
