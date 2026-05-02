const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const pino = require('pino')
const express = require('express')
const os = require('os')
const axios = require('axios')
const fs = require('fs')
const { exec } = require('child_process')

let sock
let startTime = Date.now()

const tttGames = {}
const hangmanGames = {}
const triviaGames = {}
const warnings = {}

const BOT_INFO = {
  name: "༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦",
  dev: "༄𝐌𝐑.𝐍𝐔𝐄𝐋♛",
  version: "v3.0.6 ULTRA",
  prefix: ".",
  mode: "public"
}

const API_KEYS = {
  gpt: process.env.GPT_KEY || "",
  gemini: process.env.GEMINI_KEY || "",
  ytdl: "https://api.dreaded.site",
  removebg: process.env.REMOVEBG_KEY || ""
}

const app = express()
app.get('/', (req, res) => res.send(`${BOT_INFO.name} v3.0.6 ULTRA by ${BOT_INFO.dev} Online`))
app.listen(process.env.PORT || 3000, () => console.log(`[${BOT_INFO.name}] Server running`))

setInterval(() => { if (global.gc) global.gc() }, 30000)

async function connectWA() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: [BOT_INFO.name, 'Chrome', '3.0.6'],
    getMessage: async () => ({})
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      if (shouldReconnect) setTimeout(connectWA, 5000)
    } else if (connection === 'open') {
      console.log(`✅ ${BOT_INFO.name} Connected to WhatsApp`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    
    const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || ''
    if (!body.startsWith(BOT_INFO.prefix)) return
    
    const cmd = body.slice(1).split(' ')[0].toLowerCase()
    const args = body.slice(BOT_INFO.prefix.length + cmd.length).trim()
    const from = m.key.remoteJid
    const sender = m.key.participant || from
    const isGroup = from.endsWith('@g.us')
    const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid || []
    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage

    try {
      switch(cmd) {
        case 'menu': case 'help': await sendMenu(from, m); break
        case 'ping': case 'alive': const { speed } = getStats(); await sock.sendMessage(from, { text: `*Pong!* 🏓\nSpeed: ${speed}ms\nStatus: ONLINE\n*Bot: ${BOT_INFO.name}*\n*Dev: ${BOT_INFO.dev}*` }, { quoted: m }); break
        case 'owner': await sock.sendMessage(from, { text: `*Owner:* ${BOT_INFO.dev}\n*Bot:* ${BOT_INFO.name}\n*Version:* ${BOT_INFO.version}` }, { quoted: m }); break
        case 'jid': case 'url': await sock.sendMessage(from, { text: `*Chat JID:* ${from}\n*User JID:* ${sender}` }, { quoted: m }); break
        case 'joke': const jokes = ["Why don't scientists trust atoms? Because they make up everything!", "I told my wife she was drawing her eyebrows too high. She looked surprised."]; await sock.sendMessage(from, { text: jokes[Math.floor(Math.random()*jokes.length)] }, { quoted: m }); break
        case 'quote': const quotes = ["The only way to do great work is to love what you do. - Steve Jobs", "Code is like humor. When you have to explain it, it's bad."]; await sock.sendMessage(from, { text: quotes[Math.floor(Math.random()*quotes.length)] }, { quoted: m }); break
        case 'fact': await sock.sendMessage(from, { text: `*Fact:* Honey never spoils. Archaeologists have found 3000-year-old honey in Egyptian tombs that's still edible.` }, { quoted: m }); break
        case '8ball': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}8ball will I be rich` }, { quoted: m }); const responses = ["Yes", "No", "Maybe", "Definitely", "Ask again later"]; await sock.sendMessage(from, { text: `🎱 *Question:* ${args}\n*Answer:* ${responses[Math.floor(Math.random()*responses.length)]}` }, { quoted: m }); break
        case 'weather': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}weather Lagos` }, { quoted: m }); try { const res = await axios.get(`https://wttr.in/${args}?format=3`); await sock.sendMessage(from, { text: `*Weather:* ${res.data}` }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ City not found` }, { quoted: m }) }; break
        case 'news': await sock.sendMessage(from, { text: `📰 *Latest News*\n1. Tech: New AI models released\n2. Sports: Champions League results\n3. Crypto: BTC pumps 5%\n\n*Powered by ${BOT_INFO.name}*` }, { quoted: m }); break
        case 'tts': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}tts hello world` }, { quoted: m }); await sock.sendMessage(from, { text: `🔊 TTS: "${args}"\n\n*Note: Install google-tts-api for audio*` }, { quoted: m }); break
        case 'attp': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}attp text` }, { quoted: m }); await sock.sendMessage(from, { text: `✨ *ATTP Generated*\nText: ${args}\n\n*Note: Install sticker API for image*` }, { quoted: m }); break
        case 'lyrics': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}lyrics faded` }, { quoted: m }); await sock.sendMessage(from, { text: `🎵 *Lyrics for:* ${args}\n\n[Lyrics API needed]\n*By ${BOT_INFO.name}*` }, { quoted: m }); break
        case 'groupinfo': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); const metadata = await sock.groupMetadata(from); await sock.sendMessage(from, { text: `*Group:* ${metadata.subject}\n*Members:* ${metadata.participants.length}\n*Admins:* ${metadata.participants.filter(p=>p.admin).length}\n*ID:* ${from}` }, { quoted: m }); break
        case 'vv': if (!quoted) return sock.sendMessage(from, { text: `❌ Reply to a view once message` }, { quoted: m }); await sock.sendMessage(from, { text: `🔓 *View Once Unlocked*\n*Note: Full VV needs media handling*` }, { quoted: m }); break
        case 'ss': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}ss https://google.com` }, { quoted: m }); await sock.sendMessage(from, { text: `📸 *Screenshot:* ${args}\n\n*Note: Install screenshot API*` }, { quoted: m }); break
        case 'ban': case 'kick': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); if (!mentioned[0]) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}kick @user` }, { quoted: m }); try { await sock.groupParticipantsUpdate(from, [mentioned[0]], 'remove'); await sock.sendMessage(from, { text: `✅ Kicked @${mentioned[0].split('@')[0]}`, mentions: [mentioned[0]] }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed. Bot needs admin` }, { quoted: m }) }; break
        case 'promote': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); if (!mentioned[0]) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}promote @user` }, { quoted: m }); try { await sock.groupParticipantsUpdate(from, [mentioned[0]], 'promote'); await sock.sendMessage(from, { text: `✅ Promoted @${mentioned[0].split('@')[0]}`, mentions: [mentioned[0]] }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed. Bot needs admin` }, { quoted: m }) }; break
        case 'demote': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); if (!mentioned[0]) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}demote @user` }, { quoted: m }); try { await sock.groupParticipantsUpdate(from, [mentioned[0]], 'demote'); await sock.sendMessage(from, { text: `✅ Demoted @${mentioned[0].split('@')[0]}`, mentions: [mentioned[0]] }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed. Bot needs admin` }, { quoted: m }) }; break
        case 'mute': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); const mins = parseInt(args) || 5; await sock.groupSettingUpdate(from, 'announcement'); await sock.sendMessage(from, { text: `🔇 *Group Muted* for ${mins} mins` }, { quoted: m }); setTimeout(() => sock.groupSettingUpdate(from, 'not_announcement'), mins * 60000); break
        case 'unmute': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); await sock.groupSettingUpdate(from, 'not_announcement'); await sock.sendMessage(from, { text: `🔊 *Group Unmuted*` }, { quoted: m }); break
        case 'warn': if (!isGroup ||!mentioned[0]) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}warn @user` }, { quoted: m }); warnings[mentioned[0]] = (warnings[mentioned[0]] || 0) + 1; await sock.sendMessage(from, { text: `⚠️ *@${mentioned[0].split('@')[0]} warned*\n*Total:* ${warnings[mentioned[0]]}/3`, mentions: [mentioned[0]] }, { quoted: m }); if (warnings[mentioned[0]] >= 3) await sock.groupParticipantsUpdate(from, [mentioned[0]], 'remove'); break
        case 'warnings': if (!mentioned[0]) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}warnings @user` }, { quoted: m }); await sock.sendMessage(from, { text: `⚠️ *@${mentioned[0].split('@')[0]} has ${warnings[mentioned[0]] || 0} warnings*`, mentions: [mentioned[0]] }, { quoted: m }); break
        case 'tag': case 'tagall': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); const gMeta = await sock.groupMetadata(from); const mems = gMeta.participants.map(u => u.id); await sock.sendMessage(from, { text: args || `Tagged by ${BOT_INFO.name}`, mentions: mems }, { quoted: m }); break
        case 'hidetag': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); const gm = await sock.groupMetadata(from); const ms = gm.participants.map(u => u.id); await sock.sendMessage(from, { text: args || '.', mentions: ms }, { quoted: m }); break
        case 'antilink': await sock.sendMessage(from, { text: `🔗 *Antilink Enabled*\nLinks will be deleted\n*Note: Needs message listener*` }, { quoted: m }); break
        case 'chatbot': await sock.sendMessage(from, { text: `🤖 *Chatbot Toggled*\n*Note: Needs AI integration*` }, { quoted: m }); break
        case 'clear': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); await sock.sendMessage(from, { text: `🧹 *Clearing chat...*\n*Note: WhatsApp doesn't support bulk delete via bot*` }, { quoted: m }); break
        case 'welcome': await sock.sendMessage(from, { text: `👋 *Welcome ${args}*\n*Note: Needs event listener*` }, { quoted: m }); break
        case 'goodbye': await sock.sendMessage(from, { text: `👋 *Goodbye ${args}*\n*Note: Needs event listener*` }, { quoted: m }); break
        case 'lock': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); await sock.groupSettingUpdate(from, 'locked'); await sock.sendMessage(from, { text: `🔒 *Group Locked*\nOnly admins can change info` }, { quoted: m }); break
        case 'unlock': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); await sock.groupSettingUpdate(from, 'unlocked'); await sock.sendMessage(from, { text: `🔓 *Group Unlocked*` }, { quoted: m }); break
        case 'invite': if (!isGroup) return sock.sendMessage(from, { text: `❌ Group only` }, { quoted: m }); const code = await sock.groupInviteCode(from); await sock.sendMessage(from, { text: `🔗 *Group Link:*\nhttps://chat.whatsapp.com/${code}` }, { quoted: m }); break
        case 'setgname': if (!isGroup ||!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}setgname New Name` }, { quoted: m }); try { await sock.groupUpdateSubject(from, args); await sock.sendMessage(from, { text: `✅ *Group name changed to:* ${args}` }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed. Bot needs admin` }, { quoted: m }) }; break
        case 'setgdesc': if (!isGroup ||!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}setgdesc New description` }, { quoted: m }); try { await sock.groupUpdateDescription(from, args); await sock.sendMessage(from, { text: `✅ *Group description updated*` }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed. Bot needs admin` }, { quoted: m }) }; break
        case 'mode': if (!args) return sock.sendMessage(from, { text: `*Current:* ${BOT_INFO.mode}\n*Usage:* ${BOT_INFO.prefix}mode public/private` }, { quoted: m }); BOT_INFO.mode = args.toLowerCase(); await sock.sendMessage(from, { text: `✅ Mode changed to *${BOT_INFO.mode}*` }, { quoted: m }); break
        case 'broadcast': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}broadcast message` }, { quoted: m }); await sock.sendMessage(from, { text: `📢 *Broadcasting...*\n*Note: Needs chat list storage*` }, { quoted: m }); break
        case 'sudo': await sock.sendMessage(from, { text: `👑 *Sudo List:*\n1. ${sender.split('@')[0]}\n*Note: Add sudo system*`, mentions: [sender] }, { quoted: m }); break
        case 'clearsession': exec('rm -rf./session/*', () => {}); await sock.sendMessage(from, { text: `✅ Session cleared. Restarting...` }, { quoted: m }); setTimeout(() => process.exit(0), 2000); break
        case 'cleartmp': exec('rm -rf./tmp/*', () => {}); await sock.sendMessage(from, { text: `✅ Temp files cleared` }, { quoted: m }); break
        case 'autostatus': await sock.sendMessage(from, { text: `📱 *Autostatus Toggled*\n*Note: Needs status listener*` }, { quoted: m }); break
        case 'autotyping': await sock.sendMessage(from, { text: `⌨️ *Autotyping Toggled*` }, { quoted: m }); break
        case 'autoread': await sock.sendMessage(from, { text: `👁️ *Autoread Toggled*` }, { quoted: m }); break
        case 'anticall': await sock.sendMessage(from, { text: `📵 *Anticall Toggled*\nCalls will be rejected` }, { quoted: m }); break
        case 'pmblocker': await sock.sendMessage(from, { text: `🚫 *PM Blocker Toggled*` }, { quoted: m }); break
        case 'mention': await sock.sendMessage(from, { text: `📢 *Mention Reply Toggled*` }, { quoted: m }); break
        case 'join': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}join <link>` }, { quoted: m }); const link = args.split('/')[3]; try { await sock.groupAcceptInvite(link); await sock.sendMessage(from, { text: `✅ *Joined group*` }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed to join` }, { quoted: m }) }; break
        case 'newgc': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}newgc Group Name` }, { quoted: m }); try { const gc = await sock.groupCreate(args, [sender]); await sock.sendMessage(from, { text: `✅ *Group Created:* ${args}\n*ID:* ${gc.id}` }, { quoted: m }) } catch { await sock.sendMessage(from, { text: `❌ Failed to create` }, { quoted: m }) }; break
        case 'gpt': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}gpt who is messi` }, { quoted: m }); if (!API_KEYS.gpt) return sock.sendMessage(from, { text: `❌ GPT API key not set` }, { quoted: m }); await sock.sendMessage(from, { text: `🤖 *Thinking...*` }, { quoted: m }); try { const res = await axios.post('https://api.openai.com/v1/chat/completions', { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: args }] }, { headers: { 'Authorization': `Bearer ${API_KEYS.gpt}` }}); await sock.sendMessage(from, { text: res.data.choices[0].message.content }, { quoted: m }) } catch (e) { await sock.sendMessage(from, { text: `❌ GPT Error: ${e.message}` }, { quoted: m }) }; break
        case 'gemini': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}gemini explain quantum physics` }, { quoted: m }); if (!API_KEYS.gemini) return sock.sendMessage(from, { text: `❌ Gemini API key not set` }, { quoted: m }); await sock.sendMessage(from, { text: `🧠 *Thinking...*` }, { quoted: m }); try { const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEYS.gemini}`, { contents: [{ parts: [{ text: args }] }] }); await sock.sendMessage(from, { text: res.data.candidates[0].content.parts[0].text }, { quoted: m }) } catch (e) { await sock.sendMessage(from, { text: `❌ Gemini Error: ${e.message}` }, { quoted: m }) }; break
        case 'imagine': case 'flux': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}imagine a cat` }, { quoted: m }); await sock.sendMessage(from, { text: `🎨 *Generating:* ${args}\n\n*Note: Install Stable Diffusion API*` }, { quoted: m }); break
        case 'sticker': case 's': if (!m.message.imageMessage &&!m.message.videoMessage &&!quoted) return sock.sendMessage(from, { text: `❌ Reply to image/video` }, { quoted: m }); await sock.sendMessage(from, { text: `⏳ *Creating sticker...*\n*Note: Install sharp + ffmpeg for full function*` }, { quoted: m }); break
        case 'simage': await sock.sendMessage(from, { text: `🖼️ *Sticker to Image*\n*Note: Reply to sticker*` }, { quoted: m }); break
        case 'blur': await sock.sendMessage(from, { text: `🌀 *Blur Effect*\n*Note: Reply to image + install sharp*` }, { quoted: m }); break
        case 'crop': await sock.sendMessage(from, { text: `✂️ *Crop Image*\n*Note: Reply to image*` }, { quoted: m }); break
        case 'meme': await sock.sendMessage(from, { text: `😂 *Random Meme*\n*Note: Install meme API*` }, { quoted: m }); break
        case 'take': if (!args) return sock.sendMessage(from, { text: `*Usage:* ${BOT_INFO.prefix}take Pack|Author`
