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

    let currentPage = 1;

    let totalPages = 1;

    let allRecords = [];

    // ================= LOOP PAGE =================

    do {

      const form = new FormData();

      // ================= PAYLOAD =================

      form.append(
        "current",
        currentPage
      );

      form.append(
        "size",
        100
      );

      form.append(
        "startInputTime",
        "2026-05-12 00:00:00"
      );

      form.append(
        "endInputTime",
        moment().format(
          "YYYY-MM-DD HH:mm:ss"
        )
      );

      // ================= TIME TYPE =================
      // 2 = sprinter / assign kurir
      // ============================================

      form.append(
        "timeType",
        "2"
      );

      // ================= PICK TIME =================

      form.append(
        "startPickTime",
        ""
      );

      form.append(
        "endPickTime",
        ""
      );

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

      // ================= RECORD =================

      const records =
        response.data?.data?.records || [];

      // ================= TOTAL PAGE =================

      totalPages =
        response.data?.data?.pages || 1;

      // ================= DEBUG =================

      console.log(
        `PAGE ${currentPage}/${totalPages}`
      );

      console.log(
        records.map(x => ({
          waybill:
            x.waybillId,
          status:
            x.orderStatusName,
          code:
            x.orderStatusCode,
          picker:
            x.pickStaffName,
          assign:
            x.dispatchStaffTime
        }))
      );

      // ================= GABUNG =================

      allRecords =
        allRecords.concat(records);

      // ================= NEXT PAGE =================

      currentPage++;

    } while (
      currentPage <= totalPages
    );

    // ================= FILTER STATUS =================

    const filtered =
      allRecords.filter(x => {

        return [

          100,
          101,
          102,
          105,
          106

        ].includes(
          x.orderStatusCode
        );

      });

    // ================= FORMAT DATA =================

    const finalData = filtered.map(x => ({

      // ================= BASIC =================

      id:
        x.id || "",

      waybill:
        x.waybillId || "",

      marketplace:
        x.orderSourceName || "",

      status:
        x.orderStatusName || "",

      statusCode:
        x.orderStatusCode || "",

      // ================= PICKUP =================

      pickNetwork:
        x.pickNetworkName || "",

      picker:
        x.pickStaffName || "",

      assignTime:
        x.dispatchStaffTime || "",

      bestPickStart:
        x.bestPickTimeStart || "",

      bestPickEnd:
        x.bestPickTimeEnd || "",

      latestPick:
        x.latestPickTime || "",

      pickFailReason:
        x.pickFailReason || "",

      pickFailTime:
        x.pickFailTime || "",

      // ================= PENGIRIM =================

      pengirim:
        x.senderName || "",

      noHp:
        x.senderMobilePhone || "",

      alamat:
        x.senderDetailedAddress || "",

      kotaPengirim:
        x.senderCityName || "",

      provinsiPengirim:
        x.senderProvinceName || "",

      // ================= PENERIMA =================

      penerima:
        x.receiverName || "",

      noHpPenerima:
        x.receiverMobilePhone || "",

      alamatPenerima:
        x.receiverDetailedAddress || "",

      kotaTujuan:
        x.receiverCityName || "",

      provinsiTujuan:
        x.receiverProvinceName || "",

      // ================= BARANG =================

      barang:
        x.goodsName || "",

      kategoriBarang:
        x.goodsTypeName || "",

      berat:
        x.packageTotalWeight || 0,

      beratVolume:
        x.packageChargeWeight || 0,

      qty:
        x.packageNumber || 0,

      panjang:
        x.packageLength || 0,

      lebar:
        x.packageWide || 0,

      tinggi:
        x.packageHigh || 0,

      volume:
        x.packateVolume || 0,

      // ================= PAYMENT =================

      payment:
        x.paymentModeName || "",

      cod:
        x.codNeed || 0,

      codValue:
        x.codMoney || "0",

      goodsValue:
        x.goodsValue || 0,

      totalExpenses:
        x.totalExpenses || 0,

      // ================= SERVICE =================

      layanan:
        x.sendName || "",

      express:
        x.expressTypeName || "",

      shippingMethod:
        x.shippingMethodCode || "",

      // ================= TIME =================

      inputTime:
        x.inputTime || "",

      orderTime:
        x.customerOrderTime || "",

      updateTime:
        x.updateTime || "",

      pickTime:
        x.pickTime || "",

      // ================= LAIN =================

      customerCode:
        x.customerCode || "",

      customerOrderId:
        x.customerOrderId || "",

      terminalDispatch:
        x.terminalDispatchCode || "",

      externalSorting:
        x.externalSortingCode || "",

      dispatchReason:
        x.dispatchNetworkReason || ""

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

// ================= DETAIL OMS FULL =================
app.get("/jfs-detail-full", async (req, res) => {

  try {

    const id =
      req.query.id;

    // ================= VALIDASI =================

    if (!id) {

      return res.status(400).json({

        success: false,

        error:
          "id wajib diisi"

      });

    }

    // ================= REQUEST =================

    const response = await axios.get(

      `https://jfsgw.jtcargo.co.id/customerplatform/omsOrder/detailDispatchByLog?id=${id}`,

      {

        headers: {

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

    const d =
      response.data?.data || {};

    // ================= RETURN =================

    res.json({

      success: true,

      data: {

        id:
          d.id || "",

        waybillId:
          d.waybillId || "",

        senderName:
          d.senderName || "",

        senderMobilePhone:
          d.senderMobilePhone || "",

        receiverName:
          d.receiverName || "",

        receiverMobilePhone:
          d.receiverMobilePhone || "",

        senderDetailedAddress:
          d.senderDetailedAddress || "",

        goodsName:
          d.goodsName || "",

        customerOrderTime:
          d.customerOrderTime || ""

      }

    });

  } catch (err) {

    console.log(
      "DETAIL FULL ERROR:",
      err.response?.data || err.message
    );

    res.status(500).json({

      success: false,

      error:
        err.response?.data || err.message

    });

  }

});


    // =========================
    // RESPONSE
    // =========================
    res.json({

      success: true,

      total:
        finalData.length,

      data:
        finalData

    });

  } catch (error) {

    console.log(
      "FULL OPS ERROR:",
      error.response?.data ||
      error.message
    );

    res.status(500).json({

      success: false,

      error:
        error.response?.data ||
        error.message

    });

  }

});

// ================= INVENTARIS ENGINE =================
app.get("/inventaris-engine", async (req, res) => {

  try {

    // =========================
    // VALIDASI TOKEN
    // =========================
    if (!AUTH_TOKEN) {

      return res.status(400).json({
        error: "AUTH TOKEN kosong"
      });

    }

    let allRecords = [];

    let current = 1;

    let hasMore = true;

    const maxPage = 20;

      // =========================
      // PAYLOAD
      // =========================

	const endDate = moment()
 	 .tz("Asia/Jakarta")
 	 .format("YYYY-MM-DD 23:59:59");

	const beginDate = moment()
  	.tz("Asia/Jakarta")
 	 .subtract(60, "days")
 	 .format("YYYY-MM-DD 00:00:00");

	const payload = {

        beginDate: beginDate,

	endDate: endDate,

        billCode: "",

        codNeed: "",

        convertResultFromDictionCode:
          "is_receiver_pay|124,isProblemPiece|124,cod_need|124,is_refund|124",

        convertResultFromDictionOricCode: "",

        countryId: "1",

        current: current,

        customerCode: "",

        expressTypeCode: "",

        invOverTm: "",

        isOverDate: "",

        isRefund: "",

        operateSiteType: "all",

        paginationSearchType: "list",

        queryFlag: "2",

        scanSiteCode: "SUM001A",

        scanSiteCodeId: 2015,

        scanSiteCodeName: "SUM001A",

        scanSiteCodeTypeId: 336,

        shipHour: "",

        size: 500,

        sqlCode: "realtime_inv_man_dtl"

      };

      // =========================
      // REQUEST
      // =========================
      const response = await axios.post(

        "https://jfsgw.jtcargo.co.id/jfs-report-leader/report/dynamicReport/findByPagination?sqlCode=realtime_inv_man_dtl&dcr_key=57b048fb-bc8c-4d24-982b-a750b7ce8693",

        payload,

        {

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
              "Bd-theme-4d718ae8-fa85-4edc-b98c-1a0f75e5f9f3|businessIndicatorIndex",

            "User-Agent":
              "Mozilla/5.0"

          }

        }

      );

      const records =
        response?.data?.data?.records || [];

      console.log(
        "PAGE:",
        current,
        "TOTAL:",
        records.length
      );

      allRecords =
        allRecords.concat(records);

      if (records.length < 500) {

        hasMore = false;

      } else {

        current++;

      }

      await new Promise(r =>
        setTimeout(r, 300)
      );

    }

    // =========================
    // FILTER DATA
    // =========================
    const clean =
      allRecords.map(item => ({

        billcode:
          item.billcode || "",

        goods_name:
          item.goods_name || "",

        weight:
          item.weight || "",

        volume:
          item.volume || "",

        inventoryHours:
          item.inventoryHours || 0,

        waybill_status:
          item.waybill_status || "",

        destination_site_name:
          item.destination_site_name || "",

        SEND_NEXTSTATION:
          item.SEND_NEXTSTATION || "",

        take_site_name:
          item.take_site_name || "",

        operate_site_name:
          item.operate_site_name || "",

        express_type_name:
          item.express_type_name || "",

        cod_need:
          item.cod_need || "",

        isProblemPiece:
          item.isProblemPiece || "",

        second_level_type_name:
          item.second_level_type_name || "",

        abnormal_remark:
          item.abnormal_remark || "",

        customer_code:
          item.customer_code || "",

        name:
          item.name || "",

        take_scantime:
          item.take_scantime || "",

        operate_scantime_1:
          item.operate_scantime_1 || "",

        operate_scantime_2:
          item.operate_scantime_2 || ""

      }));

    // =========================
    // RESPONSE
    // =========================
    res.json({

      success: true,

      total:
        clean.length,

      data:
        clean

    });

  } catch (error) {

    console.error(
      "ERROR INVENTARIS:",
      error.response?.data || error.message
    );

    res.status(500).json({

      error:
        "Gagal ambil data inventaris",

      detail:
        error.response?.data || error.message

    });

  }

});

// ================= FULL OPS CHECK =================
app.get("/jfs-full-ops-check", async (req, res) => {

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
    const endDate =
  moment()
    .tz("Asia/Jakarta")
    .format("YYYY-MM-DD");

const startDate =
  moment()
    .tz("Asia/Jakarta")
    .subtract(30, "days")
    .format("YYYY-MM-DD");

    // =========================
    // STEP 1
    // GET CHECK CODE
    // =========================
    let checkRecords = [];

    let current = 1;

    let hasMore = true;

    while (hasMore) {

      const payload = {

        current: current,

        size: 100,

        checkNetworkCode: "SUM001A",

        status: 3,

        checkCodes: [],

        countryId: "1",

        searchType: 1,

        startScanTime:
 	 `${startDate} 00:00:00`,

	endScanTime:
 	 `${endDate} 23:59:59`,

      };

      const response = await axios.post(

        "https://jfsgw.jtcargo.co.id/operatingplatform/opsCheck/queryOpsCheckForPage",

        payload,

        {

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
              "opsCheckPage",

            "User-Agent":
              "Mozilla/5.0"

          }

        }

      );

      const records =
        response?.data?.data?.records || [];

      console.log(
        "CHECK PAGE:",
        current,
        records.length
      );

      checkRecords =
        checkRecords.concat(records);

      if (!records.length || records.length < 100) {

        hasMore = false;

      } else {

        current++;

      }

      await new Promise(r =>
        setTimeout(r, 300)
      );

    }

    // =========================
    // AMBIL CHECK CODE
    // =========================
    const checkCodes =
      checkRecords.map(
        item => item.checkCode
      );

console.log(
  "START DATE:",
  startDate
);

console.log(
  "END DATE:",
  endDate
);

console.log(
  "TOTAL CHECK CODE:",
  checkCodes.length
);
    console.log(
      "TOTAL CHECK CODE:",
      checkCodes.length
    );

    // =========================
    // STEP 2
    // LOOP DETAIL
    // =========================
    let finalData = [];

    for (const code of checkCodes) {

      try {

        const detailPayload = {

          current: 1,

          size: 100,

          checkCode: code,

          countryId: "1"

        };

        const detailResponse =
          await axios.post(

            "https://jfsgw.jtcargo.co.id/operatingplatform/opsCheck/queryOpsCheckDetailForPage",

            detailPayload,

            {

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
                  "opsCheckPage",

                "User-Agent":
                  "Mozilla/5.0"

              }

            }

          );

        const detailRecords =
          detailResponse?.data?.data?.records || [];

        console.log(
          "DETAIL:",
          code,
          detailRecords.length
        );

        // =========================
        // FILTER DATA
        // =========================
        const clean =
          detailRecords.map(item => ({

            billCode:
              item.billCode || "",

            waybillNo:
              item.waybillNo || "",

            checkCode:
              item.checkCode || "",

            checkUser:
              item.checkUser || "",

            checkUserCode:
              item.checkUserCode || "",

            checkTime:
              item.checkTime || "",

            inStockTime:
              item.inStockTime || "",

            dispatchNetworkCode:
              item.dispatchNetworkCode || "",

            codMoney:
              item.codMoney || 0,

            dfodCodMoney:
              item.dfodCodMoney || 0,

            secondLevelTypeName:
              item.secondLevelTypeName || "",

            stockTime:
              item.stockTime || "",

            deliverScantime:
              item.deliverScantime || "",

            sendDeliverUser:
              item.sendDeliverUser || "",

            planSignTime:
              item.planSignTime || "",

            rebackStatus:
              item.rebackStatus || 0

          }));

        finalData =
          finalData.concat(clean);

      } catch (err) {

        console.log(
          "DETAIL ERROR:",
          code,
          err.message
        );

      }

      // anti limit
      await new Promise(r =>
        setTimeout(r, 200)
      );

    }

    // =========================
    // RESPONSE
    // =========================
    res.json({

      success: true,

      total:
        finalData.length,

      data:
        finalData

    });

  } catch (error) {

    console.log(
      "FULL OPS ERROR:",
      error.response?.data ||
      error.message
    );

    res.status(500).json({

      success: false,

      error:
        error.response?.data ||
        error.message

    });

  }

});

// ================= PORT =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
