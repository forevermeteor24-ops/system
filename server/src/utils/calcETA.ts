// server/src/utils/calcETA.ts

/** 使用 Haversine 公式计算两点间的地球表面距离（单位：米） */
export function haversine(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ): number {
    const R = 6371000; // 地球半径（米）
    const toRad = (deg: number) => (deg * Math.PI) / 180;
  
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
  
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
  
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
  
    const aVal =
      sinDLat * sinDLat +
      Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  
    return R * c; // 距离（米）
  }
  
  /** 计算一条轨迹的总距离（单位：米） */
  export function calcTotalDistance(
    points: { lat: number; lng: number }[]
  ): number {
    if (!points || points.length < 2) return 0;
  
    let dist = 0;
    for (let i = 1; i < points.length; i++) {
      dist += haversine(points[i - 1], points[i]);
    }
    return dist;
  }
  
  /**
   * 计算 ETA（秒）
   * @param points 路线点数组
   * @param speedMetersPerSec 小车速度（单位：米/秒）
   */
  export function calcETASeconds(
    points: { lat: number; lng: number }[],
    speedMetersPerSec: number
  ): number {
    const totalMeters = calcTotalDistance(points);
    if (!speedMetersPerSec || totalMeters === 0) return 0;
    return totalMeters / speedMetersPerSec;
  }
  
  /**
   * 将 ETA 秒数转为 “X天X小时X分钟X秒”
   */
  export function formatETA(seconds: number): string {
    if (!seconds || seconds <= 0) return "0秒";
  
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
  
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
  
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
  
    let text = "";
    if (days) text += `${days}天`;
    if (hours) text += `${hours}小时`;
    if (minutes) text += `${minutes}分钟`;
    if (seconds) text += `${seconds}秒`;
  
    return text || "0秒";
  }
  