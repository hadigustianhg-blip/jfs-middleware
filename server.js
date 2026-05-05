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
  res.send("API JFS Middleware aktif 🚀");
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


// ================= API DATA =================
app.get("/jfs-data", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const site = req.query.site || "SUM001A";

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination",
        {
          scanSiteCode: site,
          beginDate: `${date} 00:00:00`,
          endDate: `${date} 23:59:59`,
          wayType: "1",
          sqlCode: "realtime_sca_del_mon_dtl",
          current,
          size: 100,
          paginationSearchType: "list",
          countryId: "1"
        },
        {
          headers: {
            authtoken: AUTH_TOKEN,
            lang: "ID",
            langtype: "ID",
            routename: "report"
          }
        }
      );

      const records = response?.data?.data?.records || [];

      allRecords = allRecords.concat(records);

      if (records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    const clean = allRecords.map(item => {
      const [tanggal, jam] = (item.scantime || "").split(" ");

      return {
        resi: item.billcode,
        tanggal,
        jam,
        kurir: item.send_deliver_user,
        tujuan: item.receiver_detailed_address,
        berat_kg: item.settlement_weight,
        cod: item.cod_need === "Yes",
        status: item.signsite ? "TERKIRIM" : "PENDING",
        signsite: item.signsite
      };
    });

    res.json({ total: clean.length, data: clean });

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
      form.append("pickNetworkCode", "SUM001A");

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
          }
        }
      );

      const records = response?.data?.data || [];

      allRecords = allRecords.concat(records);

      if (records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }
    }

    const clean = allRecords.map(item => ({
      waybillNo: item.waybillNo,
      destination: item.destinationName,
      weight: item.waybillWeight,
      staff: item.collectStaffName,
      sender: item.senderName,
      receiver: item.receiverName
    }));

    res.json({ total: clean.length, data: clean });

  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data pickup",
      detail: error.response?.data || error.message
    });
  }
});


// ================= DISPATCH =================
app.get("/jfs-dispatch", async (req, res) => {
  try {
    if (!AUTH_TOKEN) {
      return res.status(400).json({ error: "Token kosong" });
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const response = await axios.post(
      "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
      {
        current: 1,
        size: 100,
        oneNetwork: "BDO000",
        searchTimeType: 1,
        startTime: `${date} 00:00:00`,
        endTime: `${date} 23:59:59`,
        dispatchFinanceCode: "BDO000",
        countryId: "1"
      },
      {
        headers: {
          authtoken: AUTH_TOKEN,
          lang: "ID",
          langtype: "ID",
          routename: "dispatchWaybill"
        }
      }
    );

    const records = response?.data?.data?.records || [];

    const clean = records.map(item => ({
      waybillNo: item.waybillNo,
      kurir: item.contractingAreaName,
      ongkir: item.receivePayFee,
      waktu: item.dispatchTime,
      receiver: item.receiverName,
      address: item.receiverDetailedAddress,
      status: item.isSignName,
      weight: item.chargeWeight,
      settlement: item.settlementName,
      service: item.expressTypeName,
      cod: item.codNeedName,
      codValue: item.codMoney,
      goods: item.goodsName
    }));

    res.json({ total: clean.length, data: clean });

  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data dispatch",
      detail: error.response?.data || error.message
    });
  }
});


// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
