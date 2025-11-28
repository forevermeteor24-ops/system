import { useState } from "react";
import http from "../api/http";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");

  const register = async () => {
    if (!username || !password || !address) {
      alert("请填写完整信息（用户名、密码、地址）");
      return;
    }

    try {
      await http.post("/auth/register", {
        username,
        password,
        role: "merchant", // 固定为商家
        address,          // ⭐ 直接传字符串 → 后端会自动包装成 {detail, lng, lat}
      });

      alert("商家注册成功");
      location.href = "/#/login";
    } catch (err: any) {
      alert(err.response?.data?.error || "注册失败");
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>商家注册</h2>

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
          placeholder="商家地址（如：上海市浦东新区张江高科）"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ width: 240, padding: 8 }}
        />
      </div>

      <button onClick={register} style={{ padding: "8px 24px" }}>
        注册
      </button>
    </div>
  );
}
