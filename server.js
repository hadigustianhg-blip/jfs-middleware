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
        error: "Token kosong"
      });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const site = req.query.site || "SUM001A";

    let allData = [];
    let current = 1;
    let hasMore = true;

    while (hasMore) {
      const formData = new URLSearchParams();

      formData.append("current", current);
      formData.append("size", 100);

      formData.append("pickFinanceCode", "BDO000"); // sesuai payload kamu
      formData.append("isVoid", "0");

      formData.append("timeStart", `${date} 00:00:00`);
      formData.append("timeEnd", `${date} 23:59:59`);

      formData.append("inputTimeStart", `${date} 00:00:00`);
      formData.append("inputTimeEnd", `${date} 23:59:59`);

      formData.append("pickNetworkCode", site);

      // wajib walau kosong
      formData.append("waybillNos", "");
      formData.append("customerCodes", "");
      formData.append("settlementCodes", "");
      formData.append("isRefundCodes", "");
      formData.append("sourceOfWaybillCodes", "");
      formData.append("isSigns", "");
      formData.append("calculateFeeCodes", "");
      formData.append("customerTypes", "");
      formData.append("orderSourceCodes", "");

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

      console.log(`Pickup Page ${current}: ${records.length}`);

      allData = allData.concat(records);

      if (records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    // 🔥 CLEAN DATA SESUAI KEBUTUHAN KAMU
    const clean = allData.map(item => ({
      resi: item.waybillNo,
      tanggal: item.inputTime?.split(" ")[0] || "-",
      jam: item.inputTime?.split(" ")[1] || "-",
      kurir: item.collectStaffName,
      pengirim: item.senderName,
      penerima: item.receiverName,
      tujuan: item.receiverDetailedAddress?.slice(0, 50),
      berat_kg: Number(item.waybillWeight),
      ongkir: Number(item.totalFreight),
      layanan: item.expressTypeName
    }));

    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    res.status(500).json({
      error: "pickup error",
      detail: error.response?.data || error.message
    });
  }
});
// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di port ${PORT}`);
});
