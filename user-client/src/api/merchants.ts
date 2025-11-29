// merchants.ts

export interface Merchant {
    _id: string;
    username: string;
    address: {
      detail: string;
      lng: number | null;
      lat: number | null;
    };
  }
  
  const BASE = "https://system-backend.zeabur.app/api/merchants";
  
  /* 获取所有商家（用户下单时用） */
  export async function fetchMerchants(): Promise<Merchant[]> {
    const res = await fetch(BASE);
    if (!res.ok) throw new Error("Failed to fetch merchants");
    return res.json();
  }
  