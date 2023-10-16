const express = require('express');
const cors = require('cors');
const bunyan = require('bunyan');
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

app.get('/play/:stationId/:ft/:to/playlist.m3u8', authBasic, servePlaylist);
app.get('/live/:stationId/playlist.m3u8', authBasic, servePlaylist);

const listener = app.listen(config.port, () => {
  logger.info(`Listening on port ${listener.address().port}!`);
});
