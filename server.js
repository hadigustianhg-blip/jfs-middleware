const express = require("express");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");

const app = express();

app.use(cors());
app.use(express.json());

// 🔐 TOKEN
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("API JFS Middleware (Pickup + Dispatch) 🚀");
});

// ================= SET TOKEN =================
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

// ================= COMMON HEADER =================
function getHeaders(route) {
  return {
    authtoken: AUTH_TOKEN,
    "Content-Type": "application/x-www-form-urlencoded", // 🔥 FIX
    lang: "ID",
    langtype: "ID",
    routename: route,

    origin: "https://jfs.jtcargo.co.id",
    referer: "https://jfs.jtcargo.co.id/",

    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
  };
}

// ================= ERROR HANDLER =================
function handleError(error, res, label) {
  console.error(label, error.response?.data || error.message);

  if (error.response?.data?.code === 401) {
    return res.status(401).json({
      error: "TOKEN EXPIRED",
      detail: "Silakan update token JFS"
    });
  }

  res.status(500).json({
    error: label,
    detail: error.response?.data || error.message
  });
}

// ================= PICKUP =================
app.get("/jfs-pickup", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({ error: "Token kosong" });
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

      form.append("inputTimeStart", `${date} 00:00:00`);
      form.append("inputTimeEnd", `${date} 23:59:59`);

      form.append("pickNetworkCode", "SUM001A");

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList", // 🔥 FIX
        form,
        {
          headers: {
            ...form.getHeaders(),
            ...getHeaders("sendWaybillSite") // 🔥 FIX
          }
        }
      );

      const records = response?.data?.data || [];

      console.log("PICKUP PAGE:", current, records.length);

      allRecords = allRecords.concat(records);

      if (!records || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    const clean = allRecords.map(item => ({
      waybillNo: item.waybillNo,
      pickupTime: item.inputTime,
      origin: item.originName,
      destination: item.destinationName,
      weight: item.loadWeight,
      sender: item.senderName,
      receiver: item.receiverName,
      status: item.waybillStatusName
    }));

    res.json({ total: clean.length, data: clean });

  } catch (error) {
    handleError(error, res, "Gagal ambil data pickup");
  }
});

// ================= DISPATCH =================
app.get("/jfs-dispatch", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({ error: "Token kosong" });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
        {
          current,
          size: 100,

          // ✅ WAJIB SESUAI JFS
          oneNetwork: "BDO000",

          dispatchFinanceCode: "BDO000",
          dispatchFinanceId: 183,

          searchTimeType: 1,
          startTime: `${date} 00:00:00`,
          endTime: `${date} 23:59:59`,

          isFeeCostZero: 0,
          countryId: "1"
        },
        {
          headers: getHeaders("dispatchWaybill")
        }
      );

      const resData = response?.data;

      if (!resData || resData.code !== 1) {
        throw new Error("Response tidak valid dari JFS");
      }

      const records = Array.isArray(resData.data) ? resData.data : [];

      console.log("DISPATCH PAGE:", current, records.length);

      allRecords = allRecords.concat(records);

      // ✅ FIX pagination (PENTING)
      if (records.length === 0) {
        hasMore = false;
      } else {
        current++;
      }
    }

    const clean = allRecords.map(item => ({
      waybillNo: item.waybillNo,
      kurir: item.contractingAreaName,
      ongkir: item.receivePayFee,
      waktu: item.dispatchTime,
      receiver: item.receiverName,
      address: item.receiverDetailedAddress,
      status: item.isSignName,
      berat: item.chargeWeight,
      pembayaran: item.settlementName,
      service: item.expressTypeName,
      cod: item.codNeedName,
      codValue: item.codMoney,
      barang: item.goodsName
    }));

    res.json({ total: clean.length, data: clean });

  } catch (error) {
    handleError(error, res, "Gagal ambil data dispatch");
  }
});

// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
