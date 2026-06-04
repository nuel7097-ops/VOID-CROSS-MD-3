/**
 * ༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦ — Multi-User WhatsApp Bot
 * Copyright (c) 2024 Professor
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 * - Multi-user Telegram pairing integration
 *
 * ─── HOW IT WORKS ────────────────────────────────────────────────────────────
 * 1. Start this bot (npm start)
 * 2. Users open your Telegram bot and send: /pair <their_whatsapp_number>
 * 3. They receive an 8-digit pairing code via Telegram
 * 4. They enter the code in WhatsApp → Settings → Linked Devices
 * 5. The bot is now running on their WhatsApp — they can send commands there!
 * 6. On restart, all previously connected sessions are restored automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// Load environment variables first
require('dotenv').config();
require('./settings');

const chalk = require('chalk');
const { restoreAllSessions } = require('./session_manager');
const { initTelegramBot } = require('./telegram');

async function main() {
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║ ༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦ ║'));
    console.log(chalk.bold.cyan('╚══════════════════════════════════════╝\n'));

    // Start the Telegram bot (for /pair commands)
    console.log(chalk.yellow('🤖 Starting Telegram bot...'));
    initTelegramBot();

    // Restore all previously paired WhatsApp sessions
    console.log(chalk.yellow('♻️ Restoring saved WhatsApp sessions...'));
    await restoreAllSessions();

    console.log(chalk.green('\n✅ ༗༊𝐕𝐎𝐈𝐃-𝐂𝐑𝐎𝐒 𝐌𝐃彡★🦋❦ is running!'));
    console.log(chalk.white(' Users can pair via your Telegram bot using: /pair <phone_number>\n'));
}

main().catch((err) => {
    console.error(chalk.red('Fatal error:'), err);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error(chalk.red('[UncaughtException]'), err);
});

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('[UnhandledRejection]'), err);
});
