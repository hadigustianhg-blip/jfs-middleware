const express = require("express");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const moment = require("moment-timezone");

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
      form.append("pickNetworkCode", "SUM001A");

      form.append("isVoid", "0");

      form.append("timeStart", `${date} 00:00:00`);
      form.append("timeEnd", `${date} 23:59:59`);

      form.append("inputTimeStart", `${date} 00:00:00`);
      form.append("inputTimeEnd", `${date} 23:59:59`);

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/omsWaybill/shippingWaybillList",
        form,
        {
          headers: {
            ...form.getHeaders(),
            ...getHeaders("sendWaybillSite")
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

    // =========================
    // FORMAT DATA UNTUK GSHEET
    // =========================

   const clean = allRecords.map(item => ({
  waybillNo: item.waybillNo || "",

  pickNetwork: item.pickNetworkName || "",

  destination: item.destinationName || "",

  settlement: item.settlementName || "",

  totalFreight: item.totalFreight || 0,

  freight: item.freight || 0,

  weight: item.loadWeight || 0,

  staff: item.collectStaffName || item.inputStaffName || "",

  sender: item.senderName || "",

  service: item.expressTypeName || "",

  receiver: item.receiverName || "",

  address: item.receiverDetailedAddress || ""
}));

    res.json({
      total: clean.length,
      data: clean
    });

  } catch (error) {
    handleError(error, res, "Gagal ambil data pickup");
  }
});

// ================= DISPATCH =================
app.get("/jfs-dispatch", async (req, res) => {
  try {

    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      const payload = {
        current: current,
        size: 100,

        oneNetwork: "BDO000",

        dispatchFinanceCode: "BDO000",
        dispatchFinanceId: 183,

        searchTimeType: 1,

        startTime: `${date} 00:00:00`,
        endTime: `${date} 23:59:59`,

        isFeeCostZero: 0,
        countryId: "1"
      };

      console.log("PAYLOAD:", payload);

      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/list",
        payload,
        {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",

            "Authtoken": AUTH_TOKEN,

            "Lang": "ID",
            "Langtype": "ID",

            "Origin": "https://jfs.jtcargo.co.id",
            "Referer": "https://jfs.jtcargo.co.id/",

            "Routename": "dispatchWaybill",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
          }
        }
      );

      const resData = response?.data;

      console.log(
        "RAW RESPONSE:",
        JSON.stringify(resData).slice(0, 1000)
      );

      const records =
        Array.isArray(resData?.data)
          ? resData.data
          : [];

      console.log(
        "DISPATCH PAGE:",
        current,
        records.length
      );

      allRecords = allRecords.concat(records);

      if (!records.length || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }

      await new Promise(r => setTimeout(r, 300));
    }

    const clean = allRecords.map(item => ({
      waybillNo: item.waybillNo || "",

      kurir: item.contractingAreaName || "",

      ongkir: item.receivePayFee || 0,

      waktu: item.dispatchTime || "",

      receiver: item.receiverName || "",

      address: item.receiverDetailedAddress || "",

      status: item.isSignName || "",

      berat: item.chargeWeight || 0,

      pembayaran: item.settlementName || "",

      service: item.expressTypeName || "",

      codStatus: item.codNeedName || "",

      codValue: item.codMoney || 0,

      barang: item.goodsName || ""
    }));

    res.json({
      success: true,
      total: clean.length,
      page: current - 1,
      data: clean
    });

  } catch (error) {

    console.error(
      "ERROR DISPATCH:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Gagal ambil data dispatch",
      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= AGING SIGN =================
app.get("/jfs-aging-sign", async (req, res) => {

  try {

    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    const payload = {

      timeType: "sign",

      beginDate: date,
      endDate: date,

      netType: "2",

      businessModelId: "0",

      paginationSearchType: "list",

      current: 1,
      size: 20,

      countryId: "1",

      dispatchCode: "",

      isReceivePay: "",

      isRefund: "",

      sqlCode: "realtime_bus_aging_sign_sum_nd"
    };

    const response = await axios.post(

      "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=realtime_bus_aging_sign_sum_nd&dcr_key=57b048fb-bc8c-4d24-982b-a750b7ce8693",

      payload,

      {
        headers: {

          "Accept": "application/json, text/plain, */*",

          "Content-Type": "application/json;charset=UTF-8",

          "Authtoken": AUTH_TOKEN,

          "Lang": "ID",
          "Langtype": "ID",

          "Origin": "https://jfs.jtcargo.co.id",

          "Referer": "https://jfs.jtcargo.co.id/",

          "Routename": "Bd-theme-42cb1bb7-3560-47e0-923a-f87ea5f7b1fe",

          "User-Agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
        }
      }
    );

    const records =
      response?.data?.data?.records || [];

    const clean = records.map(item => ({

      signTimelyTotal: item.signTimelyTotal || 0,

      networkName: item.networkName || "",

      signDelayOtherTotal: item.signDelayOtherTotal || 0,

      signTimelyRate: item.signTimelyRate || "0%",

      problemOtherTotal: item.problemOtherTotal || 0,

      queryTime: item.queryTime || "",

      sendCenterTotal: item.sendCenterTotal || 0,

      signDelayNoSignTotal: item.signDelayNoSignTotal || 0

    }));

    res.json({

      success: true,

      total: clean.length,

      data: clean

    });

  } catch (error) {

    console.error(
      "ERROR AGING SIGN:",
      error.response?.data || error.message
    );

    res.status(500).json({

      error: "Gagal ambil aging sign",

      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= JFS COD =================
app.get("/jfs-cod", async (req, res) => {
  try {

    // =========================
    // CHECK TOKEN
    // =========================
    if (!AUTH_TOKEN) {
      return res.status(400).json({
        error: "Token kosong"
      });
    }

    // =========================
    // DATE WIB
    // =========================
    const date =
      req.query.date ||
      moment().tz("Asia/Jakarta").format("YYYY-MM-DD");

    let allRecords = [];
    let current = 1;
    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      // =========================
      // PAYLOAD
      // =========================
      const payload = {
        current: current,
        size: 100,

        revenueNetworkCode: "SUM001A",

        financeCenterId: "BDO000",

        startTime: `${date} 00:00:00`,
        endTime: `${date} 23:59:59`,

        timeType: 1,

        countryId: "1",

        customerCode: "",
        dispatchStaffCode: "",
        repaymentStatus: "",
        repaymentType: "",
        salesmanRepaymentStatus: "",

        orderSource: [],
        repaymentSerialNoList: [],
        waybillNoList: [],

        isTimelyRepayment: ""
      };

      console.log("COD PAYLOAD:", payload);

      // =========================
      // REQUEST
      // =========================
      const response = await axios.post(
        "https://jfsgw.jtcargo.co.id/codAccounting/api/collection-receipt-detail/page",
        payload,
        {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",

            "Authtoken": AUTH_TOKEN,

            "Lang": "ID",
            "Langtype": "ID",

            "Origin": "https://jfs.jtcargo.co.id",
            "Referer": "https://jfs.jtcargo.co.id/",

            "Routename": "collectionAccountBook",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36"
          }
        }
      );

      const resData = response?.data;

      console.log(
        "RAW COD:",
        JSON.stringify(resData).slice(0, 1000)
      );

      // =========================
      // RECORDS
      // =========================
      const records =
        resData?.data?.records || [];

      console.log(
        "COD PAGE:",
        current,
        records.length
      );

      allRecords = allRecords.concat(records);

      // =========================
      // STOP PAGINATION
      // =========================
      if (!records.length || records.length < 100) {
        hasMore = false;
      } else {
        current++;
      }

      // anti limit
      await new Promise(r => setTimeout(r, 300));
    }

    // =========================
    // FORMAT DATA
    // =========================
    const clean = allRecords.map(item => ({

      waybillNo: item.waybillNo || "",

      codAmount: item.codAmount || 0,

      repaymentStatus: item.repaymentStatus || 0,

      repaymentType: item.repaymentType || 0,

      signTime: item.signTime || "",

      dispatchStaffName:
        item.dispatchStaffName || ""

    }));

    // =========================
    // RESPONSE
    // =========================
    res.json({
      success: true,
      total: clean.length,
      page: current - 1,
      data: clean
    });

  } catch (error) {

    console.error(
      "ERROR COD:",
      error.response?.data || error.message
    );

    res.status(500).json({
      error: "Gagal ambil data COD",
      detail:
        error.response?.data ||
        error.message
    });
  }
});

// ================= IBK REPORT =================
app.get("/jfs-ibk-report", async (req, res) => {

  try {

    // =========================
    // CHECK TOKEN
    // =========================
    if (!AUTH_TOKEN) {

      return res.status(400).json({
        error: "Token kosong"
      });

    }

    // =========================
    // DATE WIB
    // =========================
    const today =
      moment()
        .tz("Asia/Jakarta");

    const startDate =
      today
        .clone()
        .subtract(1, "day")
        .format("YYYY-MM-DD") +
      " 00:00:00";

    const endDate =
      today.format("YYYY-MM-DD") +
      " 23:59:59";

    let allRecords = [];

    let current = 1;

    let hasMore = true;

    const maxPage = 20;

    while (hasMore && current <= maxPage) {

      // =========================
      // PAYLOAD
      // =========================
      const payload = {

        current: current,

        size: 100,

        financialCenterId: 183,

        networkId: 2015,

        timeType: 1,

        searchType: 1,

        countryId: "1",

        recordStartTime:
          startDate,

        recordEndTime:
          endDate

      };

      console.log(
        "IBK REPORT PAYLOAD:",
        payload
      );

      // =========================
      // REQUEST
      // =========================
      const response = await axios.post(

        "https://jfsgw.jtcargo.co.id/financialmanagement/ibkFundRecord/report?current=1&size=100",

        payload,

        {

          headers: {

            "Accept":
              "application/json, text/plain, */*",

            "Content-Type":
              "application/json;charset=UTF-8",

            "Authtoken":
              AUTH_TOKEN,

            "Lang": "ID",

            "Langtype": "ID",

            "Origin":
              "https://jfs.jtcargo.co.id",

            "Referer":
              "https://jfs.jtcargo.co.id/",

            "Routename":
              "advancePaymentQuery",

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"

          }

        }
      );

      const resData =
        response?.data;

      console.log(
        "RAW IBK REPORT:",
        JSON.stringify(resData).slice(0, 1000)
      );

      // =========================
      // RECORDS
      // =========================
      const records =
        resData?.data?.records || [];

      console.log(
        "IBK REPORT PAGE:",
        current,
        records.length
      );

      allRecords =
        allRecords.concat(records);

      // =========================
      // STOP PAGINATION
      // =========================
      if (!records.length || records.length < 100) {

        hasMore = false;

      } else {

        current++;

      }

      // anti limit
      await new Promise(r =>
        setTimeout(r, 300)
      );

    }

    // =========================
    // FORMAT DATA
    // =========================
    const clean = allRecords.map(item => ({

      networkName:
        item.networkName || "",

      tradeType:
        item.tradeType || 0,

      feeTypeName:
        item.feeTypeName || "",

      feeItemTypeName:
        item.feeItemTypeName || "",

      date:
        item.date || "",

      amount:
        item.amount || 0

    }));

    // =========================
    // RESPONSE
    // =========================
    res.json({

      success: true,

      total: clean.length,

      page: current - 1,

      data: clean

    });

  } catch (error) {

    console.error(
      "ERROR IBK REPORT:",
      error.response?.data || error.message
    );

    res.status(500).json({

      error:
        "Gagal ambil data IBK REPORT",

      detail:
        error.response?.data ||
        error.message

    });

  }

});
// ================= SECRET INFO =================
app.get("/jfs-sensitive", async (req, res) => {

  try {

    if (!AUTH_TOKEN) {

      return res.status(400).json({
        error: "Token kosong"
      });

    }

    const waybillNo =
      req.query.waybillNo;

    console.log(
      "SENSITIVE REQUEST:",
      waybillNo
    );

    const response =
      await axios({

        method: "POST",

        url:
          "https://jfsgw.jtcargo.co.id/networkmanagement/dispatchWaybill/sensitiveDetailByWaybillNo",

        params: {

          waybillNo:
            waybillNo,

          chanel: 2

        },

        headers: {

          "Accept":
            "application/json, text/plain, */*",

          "Content-Type":
            "application/json;charset=UTF-8",

          "Authtoken":
            AUTH_TOKEN,

          "Lang":
            "ID",

          "Langtype":
            "ID",

          "Origin":
            "https://jfs.jtcargo.co.id",

          "Referer":
            "https://jfs.jtcargo.co.id/",

          "Routename":
            "dispatchWaybill",

          "User-Agent":
            "Mozilla/5.0"

        },

        data: {

          countryId: "1"

        }

      });

    console.log(
      "SENSITIVE SUCCESS"
    );

    const d =
      response.data.data || {};

    res.json({

      success: true,

      data: {

        waybillNo:
          d.waybillNo || "",

        dispatchTime:
          d.dispatchTime || "",

        dispatchStaffName:
          d.dispatchStaffName || "",

        receiverName:
          d.receiverName || "",

        receiverMobilePhone:
          d.receiverMobilePhone || "",

        receiverTelphone:
          d.receiverTelphone || "",

        receiverDetailedAddress:
          d.receiverDetailedAddress || "",

        chargeWeight:
          d.chargeWeight || 0,

        abnormalName:
          d.abnormalName || "",

        updateTime:
          d.updateTime || "",

        codMoney:
          d.codMoney || 0,

        goodsName:
          d.goodsName || ""

      }

    });

  } catch (err) {

    console.log(
      "SENSITIVE ERROR:",
      err.response?.data ||
      err.message
    );

    res.status(500).json({

      success: false,

      error:
        err.response?.data ||
        err.message

    });

  }

});

// ================= OMS FULL =================
app.get("/jfs-oms-full", async (req, res) => {

  try {

    const FormData = require("form-data");

    const form = new FormData();

    // ================= PAYLOAD =================

    form.append("current", 1);

    form.append("size", 100);

    form.append(
      "startInputTime",
      "2026-05-11 00:00:00"
    );

    form.append(
      "endInputTime",
      moment().format("YYYY-MM-DD HH:mm:ss")
    );

    form.append("timeType", 1);

    form.append("startPickTime", "");

    form.append("endPickTime", "");

    // ================= REQUEST =================

    const response = await axios.post(

      "https://jfsgw.jtcargo.co.id/customerplatform/omsOrderDispatch/page",

      form,

      {

        headers: {

          ...form.getHeaders(),

          accept:
            "application/json, text/plain, */*",

          authtoken:
            AUTH_TOKEN,

          lang:
            "ID",

          langtype:
            "ID",

          origin:
            "https://jfs.jtcargo.co.id",

          referer:
            "https://jfs.jtcargo.co.id/",

          routename:
            "orderScheduling",

          "user-agent":
            "Mozilla/5.0"

        }

      }

    );

    // ================= DATA =================

    const records =
      response.data?.data?.records || [];

    // ================= FORMAT =================

    const finalData = records.map(x => ({

      id:
        x.id || "",

      marketplace:
        x.orderSourceName || "",

      waybill:
        x.waybillId || "",

      status:
        x.orderStatusName || "",

      picker:
        x.pickStaffName || "",

      bestPickStart:
        x.bestPickTimeStart || "",

      bestPickEnd:
        x.bestPickTimeEnd || "",

      layanan:
        x.sendName || "",

      pengirim:
        x.senderName || "",

      noHp:
        x.senderMobilePhone || "",

      alamat:
        x.senderDetailedAddress || "",

      kotaTujuan:
        x.receiverCityName || "",

      barang:
        x.goodsName || "",

      berat:
        x.packageTotalWeight || 0,

      qty:
        x.packageNumber || 0,

      orderTime:
        x.customerOrderTime || "",

      pickTime:
        x.pickTime || "",

      assignTime:
        x.dispatchStaffTime || "",

      express:
        x.expressTypeName || "",

      payment:
        x.paymentModeName || ""

    }));

    // ================= RETURN =================

    res.json({

      success: true,

      total:
        finalData.length,

      data:
        finalData

    });

  } catch (err) {

    console.log(
      "OMS FULL ERROR:",
      err.response?.data || err.message
    );

    res.status(500).json({

      success: false,

      error:
        err.response?.data || err.message

    });

  }

});

// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
