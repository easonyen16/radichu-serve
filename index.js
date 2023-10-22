const express = require('express');
const cors = require('cors');
const bunyan = require('bunyan');
const axios = require('axios');
const radichuCore = require('radichu-core');
const config = require('./config');

const logger = bunyan.createLogger({ name: 'radichu-serve' });

radichuCore.configure(config.radichuCore);

const app = express();
app.use(cors());
app.disable('x-powered-by');

app.get('/', (req, res) => res.send('Hello World!'));

const authBasic = (req, res, next) => {
  if (req.query.token === config.token) return next();
  if (!req.headers.authorization) {
    res.header('WWW-Authenticate', 'Basic realm="Restricted Area"');
    return res.sendStatus(401);
  }
  const rgx = /^([^\s]+) (.+)$/;
  const matches = rgx.exec(req.headers.authorization);
  if (!matches) return res.sendStatus(403);
  switch (matches[1]) {
    case 'Basic':
      if (Buffer.from(matches[2], 'base64').toString() === `${config.token}:`) return next();
      break;
    case 'Bearer':
      if (matches[2] === config.token) return next();
      break;
    default:
  }
  return res.sendStatus(403);
};

const servePlaylist = async (req, res) => {
  const {
    stationId,
    ft,
    to,
  } = req.params;

  try {
    const playlistBody = await radichuCore.fetchPlaylist(stationId, ft, to);
    res.contentType('application/vnd.apple.mpegurl');
    return res.send(playlistBody);
  } catch (e) {
    logger.error(e);
    res.status(400);
    return res.send(e.message);
  }
};

const proxyToRadikoAPI = async (req, res) => {
  let tokyoDate;

  if (req.query.date && /^[0-9]{8}$/.test(req.query.date)) { // 驗證日期格式是否正確
    const year = parseInt(req.query.date.substring(0, 4), 10);
    const month = parseInt(req.query.date.substring(4, 6), 10) - 1; // 月份從0開始
    const day = parseInt(req.query.date.substring(6, 8), 10);

    tokyoDate = new Date(year, month, day);
  } else {
    const now = new Date();
    tokyoDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

    // 如果是午夜到早上5點，調整日期到前一天
    if (tokyoDate.getHours() < 5) {
      tokyoDate.setDate(tokyoDate.getDate() - 1);
    }
  }

  const targetDate = `${tokyoDate.getFullYear()}${(tokyoDate.getMonth() + 1).toString().padStart(2, '0')}${tokyoDate.getDate().toString().padStart(2, '0')}`;

  const channel = req.query.channel || 'QRR';  // 預設頻道為QRR，若客戶端未指定頻道
  const url = `https://radiko.jp/v4/program/station/date/${targetDate}/${channel}.json`;

  try {
    const response = await axios.get(url);
    return res.json(response.data);
  } catch (error) {
    logger.error(`Error while proxying to Radiko API: ${error.message}`);
    console.log(`Proxying to URL: ${url}`);
    return res.status(500).send('Error while fetching data from Radiko.');
  }
};

app.get('/schedule', proxyToRadikoAPI);

app.get('/play/:stationId/:ft/:to/playlist.m3u8', authBasic, servePlaylist);
app.get('/live/:stationId/playlist.m3u8', authBasic, servePlaylist);

const listener = app.listen(config.port, () => {
  logger.info(`Listening on port ${listener.address().port}!`);
});
