import React, { useEffect, useState } from "react";
import * as echarts from "echarts";

type HeatPoint = [number, number, number];

type DeliveryStats = {
  avgDeliveryTime: number;
  totalDelivered: number;
};

type AbnormalOrder = {
  _id: string;
  title: string;
  eta: number;
};

const BASE = "https://system-backend.zeabur.app";

export default function Dashboard() {
  const [heatmap, setHeatmap] = useState<HeatPoint[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats | null>(null);
  const [abnormalOrders, setAbnormalOrders] = useState<AbnormalOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          console.error("Token 不存在，请重新登录");
          return;
        }

        const headers = {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        };

        // 1. 热力图
        const heatRes = await fetch(`${BASE}/api/dashboard/heatmap`, {
          headers
        });
        const heatData = await heatRes.json();
        setHeatmap(heatData.points || []);

        // 2. 配送时效
        const statRes = await fetch(`${BASE}/api/dashboard/delivery-stats`, {
          headers
        });
        const stats = await statRes.json();
        setDeliveryStats(stats);

        // 3. 异常订单
        const abnRes = await fetch(`${BASE}/api/dashboard/abnormal-orders`, {
          headers
        });
        const abnormal = await abnRes.json();
        setAbnormalOrders(abnormal.abnormal || []);

      } catch (err) {
        console.error("Dashboard 加载失败", err);
      }

      setLoading(false);
    }

    loadData();
  }, []);

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
        bottom: "5%"
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
  }, [heatmap]);

  if (loading) {
    return <p style={{ padding: 20 }}>加载中...</p>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>物流数据可视化看板</h1>

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

      <div style={{ marginTop: 50 }}>
        <h2>平均配送时效</h2>
        {deliveryStats ? (
          <>
            <p>
              平均配送时长：
              <b>{Math.round(deliveryStats.avgDeliveryTime / 60000)}</b> 分钟
            </p>
            <p>已送达数量：{deliveryStats.totalDelivered}</p>
          </>
        ) : (
          <p>暂无数据</p>
        )}
      </div>

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
