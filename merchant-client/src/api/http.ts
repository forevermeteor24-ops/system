import axios from "axios";

const http = axios.create({
  // 👇 核心修改在这里：暂时写死成 Zeabur 线上后端地址
  // 请确保这里填的是您在 Zeabur 看到的那个以 "zeabur.app" 结尾的地址
  // 必须是 https:// 开头
  baseURL: "https://system-backend.zeabur.app", 
});

// ================= 以下原封不动，保留您原有的逻辑 =================

// 请求自动带 token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 自动跳转登录
http.interceptors.response.use(
  (res) => res,
  (err) => {
    // 保留您的跳转逻辑
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/#/login";
    }
    return Promise.reject(err);
  }
);

export default http;