const express = require("express");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");

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

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    while (hasMore) {
      const form = new FormData();

      form.append("current", current);
      form.append("size", 100);
      form.append("pickFinanceCode", "BDO000");
      form.append("isVoid", "0");
      form.append("timeStart", `${date} 00:00:00`);
      form.append("timeEnd", `${date} 23:59:59`);
      form.append("waybillNos", "");
      form.append("customerCodes", "");
      form.append("pickNetworkCode", "SUM001A");
      form.append("settlementCodes", "");
      form.append("isRefundCodes", "");
      form.append("sourceOfWaybillCodes", "");
      form.append("isSigns", "");
      form.append("calculateFeeCodes", "");
      form.append("customerTypes", "");
      form.append("orderSourceCodes", "");
      form.append("inputTimeStart", `${date} 00:00:00`);
      form.append("inputTimeEnd", `${date} 23:59:59`);

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
        form,
        {
          headers: {
            ...form.getHeaders(),
            authtoken: AUTH_TOKEN,
            lang: "ID",
            langtype: "ID",
            routename: "sendWaybillSite"
          },
          timeout: 60000
        }
      );

      // 🔥 ambil data per page
      const records = response?.data?.data || [];

      allRecords = allRecords.concat(records);

      console.log(`Pickup Page ${current} → ${records.length}`);

      // 🔥 stop kalau sudah habis
      if (records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }
    
// ================= DISPATCH WAYBILL =================
app.get("/jfs-dispatch", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const response = await axios.post(
      "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
      {
        current: 1,
        size: 100, // 🔥 ambil maksimal 100 data
        oneNetwork: "BDO000",
        searchTimeType: 1,
        startTime: `${date} 00:00:00`,
        endTime: `${date} 23:59:59`,
        isFeeCostZero: 0,
        dispatchFinanceCode: "BDO000",
        dispatchFinanceId: 183,
        countryId: "1"
      },
      {
        headers: {
          authtoken: AUTH_TOKEN,
          lang: "ID",
          langtype: "ID",
          routename: "dispatchWaybill",
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    // ================= AMBIL DATA =================
    const records = response?.data?.data?.records || [];

    // ================= CLEAN DATA =================
    const clean = records.map(item => ({
      waybillNo: item.waybillNo || "",
      contractingArea: item.contractingAreaName || "",
      receivePayFee: item.receivePayFee || 0,
      dispatchTime: item.dispatchTime || "",
      receiver: item.receiverName || "",
      address: item.receiverDetailedAddress || "",
      status: item.isSignName || "",
      weight: item.chargeWeight || 0,
      settlement: item.settlementName || "",
      service: item.expressTypeName || "",
      cod: item.codNeedName || "",
      codValue: item.codMoney || 0,
      goods: item.goodsName || ""
    }));

    // ================= RESPONSE =================
    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    console.error("ERROR DISPATCH:", error.response?.data || error.message);

    res.status(500).json({
      error: "Gagal ambil data dispatch",
      detail: error.response?.data || error.message
    });
  }
});
    // ================= CLEAN DATA (DI LUAR LOOP) =================
    const clean = allRecords.map(item => ({
      waybillNo: item.waybillNo,
      pickNetwork: item.pickNetworkName,
      destination: item.destinationName,
      settlement: item.settlementName,
      totalFreight: item.totalFreight,
      freight: item.freight,
      weight: item.waybillWeight,
      staff: item.collectStaffName,
      sender: item.senderName,
      service: item.expressTypeName,
      receiver: item.receiverName,
      address: item.receiverDetailedAddress || "-"
    }));

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
