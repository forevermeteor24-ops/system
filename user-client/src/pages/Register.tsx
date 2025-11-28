import { useState } from "react";
import http from "../api/http";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [detail, setDetail] = useState("");

  const register = async () => {
    if (!username || !password || !detail) {
      alert("请填写完整信息（用户名、密码、详细地址）");
      return;
    }

    try {
      await http.post("/auth/register", {
        username,
        password,
        role: "user",
        address: {
          detail, // 用户输入的字符串
          lng: null, // 先不解析坐标，发货/路线接口会自动 geocode
          lat: null,
        },
      });

      alert("注册成功");
      location.href = "/#/login";
    } catch (err: any) {
      alert(err.response?.data?.error || "注册失败");
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>用户注册</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: 240, padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: 240, padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="详细地址（如：北京市海淀区中关村）"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          style={{ width: 240, padding: 8 }}
        />
      </div>

      <button onClick={register} style={{ padding: "8px 24px" }}>
        注册
      </button>
    </div>
  );
}
