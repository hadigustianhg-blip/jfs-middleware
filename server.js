const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let AUTH_TOKEN = "11e17a31b9494b2f8875e8286666c8fb";

// endpoint update token
app.post("/set-token", (req, res) => {
  AUTH_TOKEN = req.body.token;
  res.json({ message: "Token updated" });
});

// endpoint ambil data
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

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "Gagal ambil data",
      detail: error.message
    });
  }
});

// ✅ FIX PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server jalan di port ${PORT}`);
});
