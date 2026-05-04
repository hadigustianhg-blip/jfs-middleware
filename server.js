const express = require("express");
const axios = require("axios");
const cors = require("cors");

// ✅ HARUS ADA
const app = express();

app.use(cors());
app.use(express.json());

// 🔐 token
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// ROOT
app.get("/", (req, res) => {
  res.send("API JFS Middleware aktif 🚀");
});

// UPDATE TOKEN
app.get("/set-token", (req, res) => {
  if (!req.query.token) {
    return res.status(400).json({ error: "Token wajib diisi" });
  }

  AUTH_TOKEN = req.query.token;

  res.json({
    message: "Token berhasil diupdate",
    token: AUTH_TOKEN
  });
});

// API DATA
app.get("/jfs-data", async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const site = req.query.site || "SUM001A";

    const response = await axios.post(
      "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination",
      {
        scanSiteCode: site,
        beginDate: `${date} 00:00:00`,
        endDate: `${date} 23:59:59`,
        wayType: "1",
        sqlCode: "realtime_sca_del_mon_dtl",
        current: 1,
        size: 20,
        paginationSearchType: "list",
        countryId: "1"
      },
      {
        timeout: 15000,
        headers: {
          authtoken: AUTH_TOKEN,
          lang: "ID",
          langtype: "ID",
          routename:
            "Bd-theme-b523b95e-a48c-48f3-8655-86b3fcaf6406|businessIndicatorIndex"
        }
      }
    );

    const records = response?.data?.data?.records || [];

    const clean = records.map(item => {
      const datetime = item.scantime || "";
      const [tanggal, jam] = datetime.split(" ");

      return {
        resi: item.billcode || "-",
        tanggal: tanggal || "-",
        jam: jam || "-",
        kurir: item.send_deliver_user || "-",
        tujuan: (item.receiver_detailed_address || "")
          .split(",")[0]
          .slice(0, 50),
        berat_kg: Number(item.settlement_weight) || 0,
        cod: item.cod_need === "Yes"
      };
    });

    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data",
      detail: error.response?.data || error.message
    });
  }
});

// PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di port ${PORT}`);
});
