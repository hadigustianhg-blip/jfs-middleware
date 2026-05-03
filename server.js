const express = require("express");
const axios = require("axios");
const cors = require("cors");

// ✅ HARUS DI ATAS
const app = express();

app.use(cors());
app.use(express.json());

let AUTH_TOKEN = "ISI_TOKEN_KAMU";

// endpoint root
app.get("/", (req, res) => {
  res.send("API JFS Middleware aktif 🚀");
});

// endpoint update token
app.post("/set-token", (req, res) => {
  AUTH_TOKEN = req.body.token;
  res.json({ message: "Token updated" });
});

// endpoint data
app.get("/jfs-data", async (req, res) => {
  try {
    const response = await axios.post(
      "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination",
      {
        scanSiteCode: "SUM001A",
        beginDate: "2026-04-20 00:00:00",
        endDate: "2026-04-20 23:59:59",
        wayType: "1",
        sqlCode: "realtime_sca_del_mon_dtl",
        current: 1,
        size: 50,
        paginationSearchType: "list",
        countryId: "1"
      },
      {
        headers: {
          authtoken: AUTH_TOKEN,
          lang: "ID",
          langtype: "ID",
          routename:
            "Bd-theme-b523b95e-a48c-48f3-8655-86b3fcaf6406|businessIndicatorIndex"
        }
      }
    );

    const records = response.data.data.records;

    const clean = records.map(item => ({
      resi: item.package_number,
      tanggal: item.scantime,
      kurir: item.send_deliver_user,
      tujuan: item.receiver_detailed_address,
      berat: item.settlement_weight,
      cod: item.cod_need
    }));

    res.json(clean);

  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data",
      detail: error.message
    });
  }
});

// ✅ PORT TERAKHIR
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di port ${PORT}`);
});
