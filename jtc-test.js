const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JTC_OUT_AUTH_TOKEN = process.env.JTC_OUT_AUTH_TOKEN || "";
const JTC_OUT_DEVICE_ID = process.env.JTC_OUT_DEVICE_ID || "";
const JTC_OUT_APP_VERSION = process.env.JTC_OUT_APP_VERSION || "2.1.5";

function getJtcOutHeaders() {
  return {
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip",
    "App-Channel": "Internal Deliver",
    "App-Platform": "Android_com.jtexpress.idnout",
    "App-Version": JTC_OUT_APP_VERSION,
    "authToken": JTC_OUT_AUTH_TOKEN,
    "Content-Type": "application/json; charset=UTF-8",
    "Device-ID": JTC_OUT_DEVICE_ID,
    "Device-Name": "google sdk_gphone_x86_64",
    "Device-Version": "Android-30",
    "devicefrom": "android",
    "langType": "ID",
    "system-code": "IDN-OUTAPP",
    "User-Agent": "Android-google sdk_gphone_x86_64/app_out"
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "JTC OUT safe validation test",
    writeEnabled: false
  });
});

app.get("/jtc-test-valid-station", async (req, res) => {
  const waybill = String(req.query.waybill || "").trim();

  if (!waybill) {
    return res.status(400).json({ ok: false, error: "waybill wajib diisi" });
  }

  if (!JTC_OUT_AUTH_TOKEN || !JTC_OUT_DEVICE_ID) {
    return res.status(500).json({
      ok: false,
      error: "JTC OUT belum dikonfigurasi",
      requiredEnv: ["JTC_OUT_AUTH_TOKEN", "JTC_OUT_DEVICE_ID", "JTC_OUT_APP_VERSION"]
    });
  }

  try {
    const url = `https://jfsgw.jtcargo.co.id/bc/waybillScan/validStation?waybillNo=${encodeURIComponent(waybill)}`;
    const response = await axios.get(url, {
      headers: getJtcOutHeaders(),
      timeout: 15000,
      validateStatus: () => true
    });

    return res.status(response.status >= 400 ? 502 : 200).json({
      ok: response.status >= 200 && response.status < 300,
      writePerformed: false,
      waybill,
      upstreamStatus: response.status,
      upstream: response.data
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      writePerformed: false,
      waybill,
      error: "Gagal menghubungi JTC OUT",
      detail: error.response?.data || error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JTC safe test listening on port ${PORT}`);
});
