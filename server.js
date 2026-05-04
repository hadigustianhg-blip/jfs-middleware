const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 🔐 token dari ENV / manual update
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("API JFS Middleware aktif 🚀");
});

// ================= UPDATE TOKEN =================
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

// ================= API DATA =================
app.get("/jfs-data", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong, set dulu via /set-token"
      });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const site = req.query.site || "SUM001A";

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    // 🔥 LOOP SEMUA PAGE
    while (hasMore) {
      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination",
        {
          scanSiteCode: site,
          beginDate: `${date} 00:00:00`,
          endDate: `${date} 23:59:59`,
          wayType: "1",
          sqlCode: "realtime_sca_del_mon_dtl",
          current: current,
          size: 100, // 🔥 maksimal biar cepat
          paginationSearchType: "list",
          countryId: "1"
        },
        {
          timeout: 30000,
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

      allRecords = allRecords.concat(records);

      console.log(`Page ${current} → ${records.length} data`);

      // stop kalau data terakhir
      if (records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    // ================= CLEAN DATA =================
    const clean = allRecords.map(item => {
      const datetime = item.scantime || "";
      const [tanggal, jam] = datetime.split(" ");

      // 🔥 STATUS LOGIC
      let status = "PENDING";

      if (item.signsite) {
        status = "TERKIRIM";
      } else if (item.nextstation) {
        status = "ON DELIVERY";
      }

      return {
        resi: item.billcode || "-",
        tanggal: tanggal || "-",
        jam: jam || "-",
        kurir: item.send_deliver_user || "-",
        tujuan: (item.receiver_detailed_address || "")
          .split(",")[0]
          .slice(0, 50),
        berat_kg: Number(item.settlement_weight) || 0,
        cod: item.cod_need === "Yes",
        status: status,
        signsite: item.signsite || "-"
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
// ================= API PICKUP =================
app.get("/jfs-pickup", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong, set dulu via /set-token"
      });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const site = req.query.site || "SUM001A";

    const formData = new URLSearchParams();

    formData.append("current", "1");
    formData.append("size", "100");
    formData.append("pickFinanceCode", "BDO000");
    formData.append("isVoid", "0");
    formData.append("timeStart", `${date} 00:00:00`);
    formData.append("timeEnd", `${date} 23:59:59`);
    formData.append("pickNetworkCode", site);
    formData.append("inputTimeStart", `${date} 00:00:00`);
    formData.append("inputTimeEnd", `${date} 23:59:59`);

    const response = await axios.post(
      "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
      formData,
      {
        headers: {
          authtoken: AUTH_TOKEN,
          lang: "ID",
          langtype: "ID",
          routename: "sendWaybillSite",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 30000
      }
    );

    const records = response?.data?.data?.records || [];

    // 🔥 CLEAN DATA SESUAI KEBUTUHAN KAMU
    const clean = records.map(item => {
      return {
        resi: item.waybillNo || "-",
        tanggal: (item.inputTime || "").split(" ")[0] || "-",
        jam: (item.inputTime || "").split(" ")[1] || "-",
        kurir: item.collectStaffName || "-",
        pengirim: item.senderName || "-",
        penerima: item.receiverName || "-",
        tujuan: (item.receiverDetailedAddress || "")
          .split(",")[0]
          .slice(0, 50),
        berat_kg: Number(item.waybillWeight) || 0,
        ongkir: Number(item.totalFreight) || 0,
        layanan: item.expressTypeName || "-"
      };
    });

    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data pickup",
      detail: error.response?.data || error.message
    });
  }
});
// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di port ${PORT}`);
});
