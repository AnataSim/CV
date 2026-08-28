const { WebSocketServer } = require('ws');
const { gatherSyncData } = require('./sync');
const helpers = require('../utils/helpers');

function initializeWebsocket(server) {
  const wss = new WebSocketServer({ server });
  const wsClients = new Map(); // ws -> clientState

  global.wsClients = wsClients;
  
  const clientLastData = new WeakMap();

  global.sendWsSyncPayload = async function(ws, clientState) {
    if (ws.readyState !== 1) return;
    try {
      const data = await gatherSyncData(clientState);
      const payloadStr = JSON.stringify({ action: 'syncResponse', data });

      // Deduplication: Skip sending if the payload is identical to the last sent payload for this client
      if (clientLastData.get(ws) === payloadStr) return;

      clientLastData.set(ws, payloadStr);
      ws.send(payloadStr);
    } catch (err) {
      console.error("❌ Error sending WS sync payload:", err.message);
    }
  };

  global.broadcastWsUpdate = function(type, key) {
    for (const [ws, clientState] of wsClients.entries()) {
      if (ws.readyState === 1) {
        let shouldSend = false;
        if (type === 'global') shouldSend = true;
        else if (type === 'chat' && clientState.chatChannelId === key) shouldSend = true;
        else if (type === 'user' && clientState.uid === key) shouldSend = true;
        else if (type === 'admin' && clientState.isAdmin) shouldSend = true;

        if (shouldSend) {
          global.sendWsSyncPayload(ws, clientState).catch(() => {});
        }
      }
    }
  };

  wss.on('connection', (ws) => {
    wsClients.set(ws, { uid: null, chatChannelId: null, voiceChannelId: null, isAdmin: false });

    ws.on('message', async (message) => {
      try {
        const payload = JSON.parse(message);
        if (payload.action === 'sync') {
          const clientState = wsClients.get(ws);
          if (clientState) {
            const { uid, chatChannelId, voiceChannelId } = payload.data || {};
            clientState.uid = uid || null;
            clientState.chatChannelId = chatChannelId || null;
            clientState.voiceChannelId = voiceChannelId || null;
            clientState.isAdmin = await helpers.verifyIsAdmin(uid);
            await global.sendWsSyncPayload(ws, clientState);
          }
        }
      } catch (err) {}
    });

    ws.on('close', () => {
      wsClients.delete(ws);
    });
  });

  // Periodic WebSocket broadcast sync updates every 35s to active clients (optimized for bandwidth)
  setInterval(() => {
    for (const [ws, clientState] of wsClients.entries()) {
      global.sendWsSyncPayload(ws, clientState).catch(() => {});
    }
  }, 35000);

  console.log("🔌 [WebSocket] Server WebSocket berhasil diinisialisasi.");
}

module.exports = {
  initializeWebsocket
};
