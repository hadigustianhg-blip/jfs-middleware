const express = require("express");
const P = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
const moment = require("moment-timezone");
const QRCode = require("qrcode");

const app = express();

let sock;
let latestQR = "";
let reconnecting = false;

app.use(cors());
app.use(express.json());

async function startWhatsApp() {

  const { state, saveCreds } =
  await useMultiFileAuthState("auth3");

  const { version } =
  await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true,
    logger: P({ level: "silent" })
  });

  // CONNECTION UPDATE
  sock.ev.on("connection.update", async (update) => {

    const {
      connection,
      qr,
      lastDisconnect
    } = update;

    console.log("UPDATE:", connection);

    // SIMPAN QR
    if (qr) {

      latestQR = qr;

      console.log("====================");
      console.log("QR BARU DIBUAT");
      console.log("====================");

    }

    // CONNECTED
    if (connection === "open") {

      console.log("====================");
      console.log("WHATSAPP CONNECTED");
      console.log("====================");

    }

    // DISCONNECTED
    if (connection === "close") {

      console.log("====================");
      console.log("WA DISCONNECTED");
      console.log(lastDisconnect);
      console.log("====================");

      // AUTO RECONNECT
      if (!reconnecting) {

        reconnecting = true;

        setTimeout(() => {

          reconnecting = false;

          startWhatsApp();

        }, 5000);

      }

    }

  });

  // SAVE SESSION
  sock.ev.on("creds.update", saveCreds);

}

startWhatsApp();

// 🔐 TOKEN
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// ================= ROOT =================
// ================= TEST WA =================
app.get("/test-wa", async (req, res) => {

  try {

    if (!sock || !sock.user) {
      return res.send("WhatsApp belum connect");
    }

    await sock.sendMessage(
      "6282116534196@s.whatsapp.net",
      {
        text: "WhatsApp bot berhasil terhubung 🚀"
      }
    );

    res.send("Pesan berhasil dikirim");

  } catch (err) {

    console.log(err);

    res.send("Gagal kirim pesan");

  }

});

// ================= SEND WA =================
app.get("/send", async (req, res) => {

  try {

    const to = req.query.to;
    const msg = req.query.msg;

    // VALIDASI
    if (!to || !msg) {
      return res.status(400).send("to & msg wajib");
    }

    // CHECK WA CONNECT
    if (!sock || !sock.user) {
      return res.send("WhatsApp belum connect");
    }

    // FORMAT NOMOR
    const nomor =
      to.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    // KIRIM PESAN
    await sock.sendMessage(
      nomor,
      {
        text: msg
      }
    );

    res.send("Pesan berhasil dikirim");

  } catch (err) {

    console.log(err);

    res.send("Gagal kirim pesan");

  }

});
// ================= GROUP LIST =================
app.get("/groups", async (req, res) => {

  try {

    if (!sock || !sock.user) {
      return res.send("WhatsApp belum connect");
    }

    const groups =
      await sock.groupFetchAllParticipating();

    const data =
      Object.values(groups).map(g => ({

        id: g.id,

        nama: g.subject

      }));

    res.json(data);

  } catch (err) {

    console.log(err);

    res.send("Gagal ambil grup");

  }

});
// ================= SEND IMAGE GROUP =================
// ================= SEND IMAGE GROUP =================
app.get("/send-image-group", async (req, res) => {

  try {

    const group = req.query.group;
    const image = req.query.image;
    const caption = req.query.caption || "";

    // CHECK WA
    if (!sock || !sock.user) {
      return res.send("WhatsApp belum connect");
    }

    // VALIDASI
    if (!group || !image) {
      return res.send("group dan image wajib diisi");
    }

    // DOWNLOAD IMAGE
    const response = await axios({
      method: "get",
      url: image,
      responseType: "arraybuffer"
    });

    // BUFFER IMAGE
    const buffer = Buffer.from(response.data, "binary");

    // KIRIM IMAGE
    await sock.sendMessage(
      group,
      {
        image: buffer,
        caption: caption
      }
    );

    console.log("IMAGE BERHASIL:", group);

    res.send("Image grup berhasil dikirim");

  } catch (err) {

    console.log(err);

    res.send("Gagal kirim image grup");

  }

});

// ================= QR =================
app.get("/qr", async (req, res) => {

  if (!latestQR) {
    return res.send("QR belum tersedia");
  }

  const image = await QRCode.toDataURL(latestQR);

  res.send(`
    <div style="padding:20px">
      <h2>QR WhatsApp</h2>
      <img src="${image}" />
    </div>
  `);

});
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

// ================= PORT =================

app.get("/", (req, res) => {
  res.send("WA BOT RUNNING");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
