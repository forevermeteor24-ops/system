/**
 * 计算剩余时间，返回 "X天X小时X分钟" 格式
 * @param eta 后端返回的时间戳（毫秒）
 */
export function formatRemainingETA(eta: number | string | undefined | null): string {
    if (!eta) return "--";
  
    const diff = Number(eta) - Date.now(); // 毫秒
    if (diff <= 0) return "已送达";
  
    let seconds = Math.floor(diff / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
  
    let result = "";
    if (days > 0) result += `${days}天 `;
    if (hours > 0) result += `${hours}小时 `;
    result += `${minutes}分钟`;
  
    return result.trim();
  }
  