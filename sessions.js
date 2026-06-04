/**
 * ༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦ — Multi-User Session Manager
 *
 * Each user pairs their own WhatsApp number via Telegram.
 * This module maintains one Baileys connection per user and
 * auto-reconnects on restart by loading all sessions from disk.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const NodeCache = require('node-cache');
const pino = require('pino');
const PhoneNumber = require('awesome-phonenumber');
const { jidDecode, jidNormalizedUser } = require('@whiskeysockets/baileys');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
} = require('@whiskeysockets/baileys');

const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const store = require('./lib/lightweight_store');
const settings = require('./settings');

// Root directory where all per-user sessions are stored
const SESSIONS_DIR = path.join(__dirname, 'sessions');

// Map of phoneNumber (string) → { socket, reconnecting }
const activeSessions = new Map();

// Callbacks for notifying Telegram when things happen
let onPairCodeCb = null; // called with (phone, code) when a pair code is generated
let onConnectedCb = null; // called with (phone) when a session connects
let onDisconnectedCb = null; // called with (phone) when a session is permanently lost

/**
 * Register callbacks from the Telegram layer.
 */
function registerCallbacks({ onPairCode, onConnected, onDisconnected } = {}) {
    if (onPairCode) onPairCodeCb = onPairCode;
    if (onConnected) onConnectedCb = onConnected;
    if (onDisconnected) onDisconnectedCb = onDisconnected;
}

/**
 * Ensure the sessions root directory exists.
 */
function ensureSessionsDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}

/**
 * Return the session directory for a given phone number.
 */
function sessionDir(phone) {
    return path.join(SESSIONS_DIR, phone);
}

/**
 * List all phone numbers that have an existing session folder on disk.
 */
function listSavedSessions() {
    ensureSessionsDir();
    return fs.readdirSync(SESSIONS_DIR).filter(name => {
        const dir = path.join(SESSIONS_DIR, name);
        return fs.statSync(dir).isDirectory();
    });
}

/**
 * Delete a user's session folder (e.g. after logout).
 */
function deleteSession(phone) {
    const dir = sessionDir(phone);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(chalk.yellow(`[Sessions] Deleted session for ${phone}`));
    }
    activeSessions.delete(phone);
}

/**
 * Start (or restart) a WhatsApp session for the given phone number.
 * If requestPairCode=true, requests a pairing code and fires onPairCodeCb.
 */
async function startSession(phone, requestPairCode = false) {
    if (activeSessions.has(phone) && activeSessions.get(phone).reconnecting === false) {
        console.log(chalk.blue(`[Sessions] Session already active for ${phone}`));
        return;
    }

    const dir = sessionDir(phone);
    fs.mkdirSync(dir, { recursive: true });

    console.log(chalk.green(`[Sessions] Starting session for ${phone}...`));

    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(dir);
        const msgRetryCounterCache = new NodeCache();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({ level: 'fatal' }).child({ level: 'fatal' })
                ),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                const jid = jidNormalizedUser(key.remoteJid);
                const msg = await store.loadMessage(jid, key.id);
                return msg?.message || '';
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        });

        activeSessions.set(phone, { socket: sock, reconnecting: false });

        sock.ev.on('creds.update', saveCreds);
        store.bind(sock.ev);

        // ── Pairing code request ──────────────────────────────────────────
        if (requestPairCode &&!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(phone);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    console.log(chalk.bgGreen(`[Sessions] Pairing code for ${phone}: ${code}`));
                    if (onPairCodeCb) onPairCodeCb(phone, code);
                } catch (err) {
                    console.error(`[Sessions] Failed to get pairing code for ${phone}:`, err.message);
                    if (onPairCodeCb) onPairCodeCb(phone, null, err.message);
                }
            }, 3000);
        }

        // ── Helpers attached to socket ────────────────────────────────────
        sock.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return decode.user && decode.server? decode.user + '@' + decode.server : jid;
            }
            return jid;
        };

        sock.getName = (jid, withoutContact = false) => {
            const id = sock.decodeJid(jid);
            let v;
            if (id.endsWith('@g.us')) {
                return new Promise(async (resolve) => {
                    v = store.contacts[id] || {};
                    if (!(v.name || v.subject)) v = await sock.groupMetadata(id).catch(() => ({}));
                    resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'));
                });
            } else {
                v = id === '0@s.whatsapp.net'
                   ? { id, name: 'WhatsApp' }
                    : id === sock.decodeJid(sock.user?.id)
                       ? sock.user
                        : (store.contacts[id] || {});
                return (withoutContact? '' : v.name) || v.subject || v.verifiedName ||
                    PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international');
            }
        };

        sock.public = true;

        const { smsg } = require('./lib/myfunc');
        sock.serializeM = (m) => smsg(sock, m, store);

        sock.ev.on('contacts.update', update => {
            for (const contact of update) {
                const id = sock.decodeJid(contact.id);
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
            }
        });

        // ── Message handling ──────────────────────────────────────────────
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage'
                   ? mek.message.ephemeralMessage.message
                    : mek.message;

                if (mek.key?.remoteJid === 'status@broadcast') {
                    await handleStatus(sock, chatUpdate);
                    return;
                }

                if (!sock.public &&!mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us');
                    if (!isGroup) return;
                }

                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

                if (sock.msgRetryCounterCache) sock.msgRetryCounterCache.clear();

                try {
                    await handleMessages(sock, chatUpdate, true);
                } catch (err) {
                    console.error(`[Sessions][${phone}] Error in handleMessages:`, err.message);
                    if (mek.key?.remoteJid) {
                        await sock.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.'
                        }).catch(() => {});
                    }
                }
            } catch (err) {
                console.error(`[Sessions][${phone}] messages.upsert error:`, err.message);
            }
        });

        sock.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(sock, update);
        });

        sock.ev.on('status.update', async (status) => {
            await handleStatus(sock, status);
        });

        // ── Anti-call ─────────────────────────────────────────────────────
        const antiCallNotified = new Set();
        sock.ev.on('call', async (calls) => {
            try {
                const { readState } = require('./commands/anticall');
                const st = readState();
                if (!st.enabled) return;
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    try {
                        if (typeof sock.rejectCall === 'function' && call.id) {
                            await sock.rejectCall(call.id, callerJid);
                        }
                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid);
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                            await sock.sendMessage(callerJid, {
                                text: '📵 Anticall is enabled. Your call was rejected.'
                            });
                        }
                    } catch (_) {}
                    setTimeout(async () => {
                        try { await sock.updateBlockStatus(callerJid, 'block'); } catch (_) {}
                    }, 800);
                }
            } catch (_) {}
        });

        // ── Connection state ──────────────────────────────────────────────
        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (connection === 'open') {
                console.log(chalk.green(`[Sessions] ✅ Connected: ${phone}`));
                activeSessions.set(phone, { socket: sock, reconnecting: false });

                // Send welcome message to the bot's own number
                try {
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await sock.sendMessage(botJid, {
                        text: `🤖 *༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦ Connected!*\n\n` +
                              `✅ Your WhatsApp is now linked to ༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦.\n` +
                              `👑 Owner: ༄𝐌𝐑.𝐍𝐔𝐄𝐋♛\n` +
                              `📱 Number: +${phone}\n` +
                              `⏰ Time: ${new Date().toLocaleString()}\n\n` +
                              `Send *!help* to see all available commands.`
                    });
                } catch (_) {}

                if (onConnectedCb) onConnectedCb(phone);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

                console.log(chalk.red(`[Sessions] ❌ Disconnected: ${phone} (code ${statusCode})`));

                if (loggedOut) {
                    console.log(chalk.yellow(`[Sessions] Session logged out for ${phone}. Deleting session.`));
                    deleteSession(phone);
                    if (onDisconnectedCb) onDisconnectedCb(phone);
                } else {
                    // Reconnect with backoff
                    const entry = activeSessions.get(phone) || {};
                    entry.reconnecting = true;
                    activeSessions.set(phone, entry);
                    console.log(chalk.yellow(`[Sessions] Reconnecting ${phone} in 5s...`));
                    await delay(5000);
                    await startSession(phone, false);
                }
            }
        });

        return sock;
    } catch (err) {
        console.error(`[Sessions] Error starting session for ${phone}:`, err.message);
        await delay(5000);
        await startSession(phone, false);
    }
}

/**
 * Restore all sessions that exist on disk.
 * Called at bot startup.
 */
async function restoreAllSessions() {
    ensureSessionsDir();
    store.readFromFile();

    const phones = listSavedSessions();
    console.log(chalk.blue(`[Sessions] Found ${phones.length} saved session(s). Restoring...`));

    for (const phone of phones) {
        await startSession(phone, false);
        await delay(2000); // stagger connections to avoid rate limiting
    }
}

/**
 * Request a pairing code for a new user.
 * Creates a session directory and starts the connection.
 */
async function requestPairForUser(phone) {
    // If already active and connected, don't create a duplicate
    if (activeSessions.has(phone)) {
        const entry = activeSessions.get(phone);
        if (entry &&!entry.reconnecting) {
            return 'ALREADY_CONNECTED';
        }
    }
    await startSession(phone, true);
    return 'PAIRING_STARTED';
}

/**
 * Get a map of all currently active sessions.
 */
function getActiveSessions() {
    return activeSessions;
}

// Periodic store write
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);

// Memory guard
setInterval(() => {
    if (global.gc) global.gc();
    const used = process.memoryUsage().rss / 1024;
    if (used > 600) {
        console.log(chalk.red(`⚠️ RAM too high (${Math.round(used)}MB). Restarting...`));
        process.exit(1);
    }
}, 30_000);

module.exports = {
    registerCallbacks,
    restoreAllSessions,
    requestPairForUser,
    startSession,
    deleteSession,
    getActiveSessions,
    listSavedSessions,
};
