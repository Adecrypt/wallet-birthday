const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

// First ETH transaction
app.get("/eth-first-tx", async (req, res) => {
  const { address, apikey } = req.query;
  try {
    const response = await axios.get(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${apikey}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All ETH transactions for stats
app.get("/eth-all-tx", async (req, res) => {
  const { address, apikey } = req.query;
  try {
    const response = await axios.get(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${apikey}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ENS name lookup
app.get("/ens", async (req, res) => {
  const { address, apikey } = req.query;
  try {
    const response = await axios.get(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=addresstotokenholdings&address=${address}&apikey=${apikey}`
    );
    // Use ENS via reverse lookup
    const ensRes = await axios.get(
      `https://api.ensideas.com/ens/resolve/${address}`
    );
    res.json({ name: ensRes.data?.name || null });
  } catch (err) {
    res.json({ name: null });
  }
});

// First ERC-20 token
app.get("/eth-first-token", async (req, res) => {
  const { address, apikey } = req.query;
  try {
    const response = await axios.get(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${apikey}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// First NFT (ERC-721)
app.get("/eth-first-nft", async (req, res) => {
  const { address, apikey } = req.query;
  try {
    const response = await axios.get(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokennfttx&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=${apikey}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));