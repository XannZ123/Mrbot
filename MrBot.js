// =========================================================================
// 🛡️ GLOBAL PROCESS CRASH SHIELD (ANTI-CRASH 24/7)
// =========================================================================
process.on('uncaughtException', (err) => {
  console.error('[🛡️ CRASH SHIELD] Uncaught Exception dicegah:', err?.message || err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[🛡️ CRASH SHIELD] Unhandled Rejection dicegah:', reason?.message || reason)
})

const mineflayer = require('mineflayer')
const os = require('os')
const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const GoalXYZ = goals.GoalXYZ
const GoalFollow = goals.GoalFollow

// =========================================================================
// ⚙️ KONFIGURASI UTAMA (DEFAULT KHUSUS PC: Mrbotszx01)
// =========================================================================
const USERNAME = process.argv[2] || 'Mrbotszx01'
const HOST = process.env.MC_HOST || 'relxmc.com'
const PORT = parseInt(process.env.MC_PORT || '25565', 10)
const PASSWORD_BOT = process.env.MC_PASSWORD || 'bots1223'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || Buffer.from('TVRVME56UXpOekV6TXpBNU56SXdPVGcyTmcuRzl1MWRXLjl4VFRxQlE5Z0FWUVo2dllfZGJ3NmJBLTVGNFNIOWpJVnRVU0Jz', 'base64').toString('utf8')
const URL_MONITOR_SYSTEM = process.env.DISCORD_MONITOR_WEBHOOK || 'https://discord.com/api/webhooks/1547438909099610182/_PXNoIpa0OLtCwxiEnIAUUOAIuOuSoumbt_6bgKzMwfnSIzIJvrCI8zOf0leVW2M6BzJ'
const URL_LOGS_AFK = process.env.DISCORD_LOG_WEBHOOK || 'https://discord.com/api/webhooks/1547438381955293185/kgdO1Fgudc4dlEvdvggJEoUv9jB3T6fOiaCYaeby5QKEprF1I7mUxchAV5oV8l5jLoFI'
const CHANNEL_CHAT_DARI_DISCORD = process.env.DISCORD_CHANNEL_ID || '1547261418020143176'

// =========================================================================
// 🌐 DISCORD CLIENT & MONITORING
// =========================================================================
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

let pesanMonitorId = null
const botStartTime = Date.now()
let bot = null
let timerRestartCheck = null
let reconnectTimer = null
let sudahLoginSukses = false
let sedangReconnect = false
let sengajaBerhenti = false
let wasDead = false
let sweepInterval = null

// =========================================================================
// 📢 MODUL SPAM CHAT (SAMA PERSIS DENGAN MANAGER.JS)
// =========================================================================
let isSpamming = false
let spamTimer = null
let spamMessage = ''
let spamDelay = 35
let antiDuplikat = true

function startSpam(pesan, jeda = 35, duplicateSafe = true) {
  stopSpam()

  if (!pesan || !pesan.trim()) {
    console.log('⚠️ [SPAM] Pesan spam tidak boleh kosong! Ketik: spam <isi pesan>')
    return false
  }

  isSpamming = true
  spamMessage = pesan.trim()
  spamDelay = Math.max(3, parseInt(jeda, 10) || 35)
  antiDuplikat = duplicateSafe

  function kirimPesan() {
    if (!isSpamming || !bot || !bot.chat) {
      stopSpam()
      return
    }

    // Gabung baris (Enter) menjadi 1 baris utuh dengan separator cantik
    let cleanMessage = spamMessage
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' &f&l• ')

    if (!cleanMessage) return

    if (antiDuplikat) {
      const randomCode = Math.floor(100 + Math.random() * 900)
      cleanMessage = `${cleanMessage} [${randomCode}]`
    }

    try {
      bot.chat(cleanMessage)
      console.log(`[📢 SPAM ${USERNAME} (${spamDelay}s)]: ${cleanMessage}`)
    } catch (err) {
      console.log(`[❌ GAGAL SPAM]: ${err.message}`)
    }
  }

  // Kirim pesan pertama langsung
  kirimPesan()
  spamTimer = setInterval(kirimPesan, spamDelay * 1000)

  console.log(`\n✅ SPAM CHAT AKTIF untuk [${USERNAME}]!`)
  console.log(`• Jeda: ${spamDelay} detik sekali`)
  console.log(`• Anti-Duplikat: ${antiDuplikat ? 'Aktif [123]' : 'Nonaktif'}`)
  console.log(`• Ketik 'stopspam' di terminal ini untuk berhenti.\n`)
  return true
}

function stopSpam() {
  if (spamTimer) {
    clearInterval(spamTimer)
    spamTimer = null
  }
  if (isSpamming) {
    isSpamming = false
    console.log(`🛑 [SPAM] Spam chat untuk ${USERNAME} telah dihentikan.`)
  }
}

// =========================================================================
// 💬 CHAT & LOGGING HELPERS
// =========================================================================
function safeChat(pesan, delayMs = 400) {
  if (!bot || !bot.chat) return
  setTimeout(() => {
    if (!bot || !bot.chat) return
    try {
      bot.chat(pesan)
      console.log(`[💬 ${USERNAME}]: ${pesan}`)
    } catch (e) {
      console.log('[Gagal kirim chat]:', e.message)
    }
  }, delayMs)
}

function formatReason(reason) {
  if (reason === undefined || reason === null) return 'Koneksi terputus dari server'
  try {
    if (typeof reason === 'string') {
      try {
        const parsed = JSON.parse(reason)
        return formatReason(parsed)
      } catch (_) {
        return reason
      }
    }
    if (typeof reason === 'object') {
      if (typeof reason.text === 'string' && reason.text) return reason.text
      if (Array.isArray(reason.extra)) return reason.extra.map(x => formatReason(x)).join('')
      if (reason.translate) {
        let result = reason.translate
        if (Array.isArray(reason.with)) result += ' ' + reason.with.map(x => formatReason(x)).join(' ')
        return result
      }
      return JSON.stringify(reason)
    }
    return String(reason)
  } catch (e) {
    return 'Gagal memparsing alasan disconnect'
  }
}

function potongLog(text, max = 3800) {
  return String(text || '').slice(0, max)
}

function kirimWebhookLog(pesan, warna = 16777215) {
  if (!URL_LOGS_AFK || URL_LOGS_AFK.includes('TAMPAL_URL')) return
  fetch(URL_LOGS_AFK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '🤖 Log Akun: ' + USERNAME,
        description: potongLog(pesan),
        color: warna,
        timestamp: new Date().toISOString()
      }]
    })
  }).catch(() => {})
}

function buatProgressBar(persen) {
  const totalKotak = 10
  const terisi = Math.min(Math.max(Math.round((persen / 100) * totalKotak), 0), totalKotak)
  return '■'.repeat(terisi) + '□'.repeat(totalKotak - terisi)
}

async function perbaruiSystemMonitor() {
  if (!URL_MONITOR_SYSTEM || URL_MONITOR_SYSTEM.includes('TAMPAL_URL')) return

  const totalRamGB = Number(os.totalmem() / (1024 ** 3)).toFixed(2)
  const freeRamGB = Number(os.freemem() / (1024 ** 3)).toFixed(2)
  const usedRamGB = Number(totalRamGB - freeRamGB).toFixed(2)
  const persenRam = Number((usedRamGB / totalRamGB) * 100).toFixed(0)

  const cpus = os.cpus()
  const modelCpu = cpus && cpus.length > 0 ? cpus[0].model : 'PC Lokal'

  const totalDetik = Math.floor((Date.now() - botStartTime) / 1000)
  const jam = Math.floor(totalDetik / 3600)
  const menit = Math.floor((totalDetik % 3600) / 60)
  const stringUptime = jam + 'j ' + menit + 'm'

  let latensiServer = '0ms'
  if (bot && bot.player && bot.player.ping !== undefined) {
    latensiServer = bot.player.ping + 'ms'
  }

  const statusOnline = (bot && bot.entity)
    ? '🟢 **STATUS: ONLINE DI PC & RUNNING 24/7**'
    : '🔴 **STATUS: OFFLINE / MENYAMBUNG**'

  const spamStatusStr = isSpamming ? `\n📢 **Spam Chat:** AKTIF (${spamDelay}s)` : ''

  const embedData = {
    embeds: [{
      title: '🖥️ PC BOT MONITOR - ' + USERNAME,
      description: statusOnline + spamStatusStr + '\n\n**⚙️ RESOURCE COMPUTER**',
      color: (bot && bot.entity) ? 3066993 : 15158332,
      fields: [
        {
          name: '🌐 GAME NETWORK',
          value: '**Server:** `' + HOST + '` ┃ **Ping:** `' + latensiServer + '` ┃ **Uptime:** `' + stringUptime + '`',
          inline: false
        },
        {
          name: '⚙️ PC RESOURCE',
          value: '`' + modelCpu + '`\n`[' + buatProgressBar(persenRam) + ']` ' + persenRam + '% ┃ ' + usedRamGB + ' / ' + totalRamGB + ' GB',
          inline: false
        }
      ],
      footer: {
        text: '🟢 PC STANDALONE • ' + new Date().toLocaleTimeString('id-ID') + ' WIB'
      }
    }]
  }

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_pos_${USERNAME}`)
      .setLabel('📍 Cek Posisi')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`btn_stop_${USERNAME}`)
      .setLabel('🛑 Stop Gerak')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`btn_maju_${USERNAME}`)
      .setLabel('🏃 Maju 1 Blok')
      .setStyle(ButtonStyle.Success)
  )

  const pathFileId = './monitor_' + USERNAME + '.txt'
  if (!pesanMonitorId && fs.existsSync(pathFileId)) {
    pesanMonitorId = fs.readFileSync(pathFileId, 'utf8').trim()
  }

  try {
    if (!pesanMonitorId) {
      const res = await fetch(URL_MONITOR_SYSTEM + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...embedData, components: [rowButtons.toJSON()] })
      })
      if (res.ok) {
        const d = await res.json()
        pesanMonitorId = d.id
        fs.writeFileSync(pathFileId, pesanMonitorId, 'utf8')
      }
    } else {
      await fetch(URL_MONITOR_SYSTEM + '/messages/' + pesanMonitorId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...embedData, components: [rowButtons.toJSON()] })
      })
    }
  } catch (error) {
    // Abaikan error monitor
  }
}

function jadwalkanReconnect(alasan = 'Koneksi terputus') {
  if (sengajaBerhenti) return
  if (reconnectTimer) return

  sedangReconnect = true
  console.log(`[🔄 ${USERNAME}] ${alasan}. Reconnect dalam 8 detik...`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    createMinecraftBot()
  }, 8000)
}

// =========================================================================
// 🎮 CORE MINECRAFT CLIENT BOT
// =========================================================================
function createMinecraftBot() {
  if (sengajaBerhenti) return

  if (bot) {
    try {
      bot.removeAllListeners()
      bot.end()
    } catch (_) {}
  }

  if (sweepInterval) {
    clearInterval(sweepInterval)
    sweepInterval = null
  }

  console.log(`\n[!] Menghubungkan ${USERNAME} ke ${HOST}:${PORT}...`)
  sudahLoginSukses = false

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: "1.21.1",
    auth: 'offline',
    viewDistance: 'tiny',
    hideErrors: false,
    checkTimeoutInterval: 90 * 1000
  })

  // 🛡️ ANTI-CRASH MOB FARM & DROP ITEM:
  bot.on('entitySpawn', (entity) => {
    if (entity && (entity.name === 'item' || entity.type === 'item' || entity.name === 'experience_orb' || entity.type === 'object')) {
      delete bot.entities[entity.id]
    }
  })

  sweepInterval = setInterval(() => {
    if (!bot || !bot.entities) return
    try {
      Object.keys(bot.entities).forEach(id => {
        const ent = bot.entities[id]
        if (ent && (ent.name === 'item' || ent.type === 'item' || ent.name === 'experience_orb' || ent.type === 'object')) {
          delete bot.entities[id]
        }
      })
    } catch (_) {}
  }, 10000)

  bot.loadPlugin(pathfinder)

  // 💬 DETEKSI CHAT & RESTART SERVER
  bot.on('message', (jsonMsg) => {
    const pesanChat = jsonMsg.toString().trim()
    if (!pesanChat) return

    const pesanLower = pesanChat.toLowerCase()

    // 1. AUTO PINDAH SUB-SERVER JIKA LOGIN BERHASIL
    if (
      /berhasil/i.test(pesanChat) ||
      /sukses/i.test(pesanChat) ||
      /welcome/i.test(pesanChat) ||
      /selamat datang/i.test(pesanChat)
    ) {
      if (!sudahLoginSukses) {
        sudahLoginSukses = true
        console.log(`[🤖 ${USERNAME}] Login terdeteksi sukses. Mengalihkan ke /server ecocpvp...`)

        setTimeout(() => {
          safeChat('/server ecocpvp', 300)
          kirimWebhookLog(`🚀 **AUTO SERVER** - Mengalihkan akun ke sub-server \`ecocpvp\`.`, 16776960)
        }, 4000)
        return
      }
    }

    // 2. DETEKSI RESTART SERVER
    if (
      /restart/i.test(pesanChat) ||
      /server closed/i.test(pesanChat) ||
      /sedang dimatikan/i.test(pesanChat) ||
      /fallback/i.test(pesanChat) ||
      /pindah ke hub/i.test(pesanChat) ||
      /maintenance/i.test(pesanChat)
    ) {
      console.log(`[⚠️ WARNING ${USERNAME}] Server restart/maintenance: ${pesanChat}`)
      kirimWebhookLog(`🔄 **SERVER RESTART** - Server restart. Bersiap masuk kembali.`, 15105570)

      if (timerRestartCheck) clearInterval(timerRestartCheck)
      timerRestartCheck = setInterval(() => {
        if (bot && bot.chat) {
          safeChat('/server ecocpvp', 300)
        }
      }, 15000)
    }

    // 3. DETEKSI SUKSES KEMBALI KE ECOCPVP
    if (/ecocpvp/i.test(pesanChat) && (/terhubung/i.test(pesanChat) || /menyambung/i.test(pesanChat) || /masuk/i.test(pesanChat))) {
      if (timerRestartCheck) {
        clearInterval(timerRestartCheck)
        timerRestartCheck = null
        console.log(`[✅ SUCCESS ${USERNAME}] Berhasil masuk kembali ke Ecocpvp!`)
        kirimWebhookLog(`🟢 **ECOCPVP READY** - Berhasil masuk kembali ke arena \`ecocpvp\`.`, 3066993)
      }
    }

    // 4. DETEKSI TPA REQUEST
    const isTpaRequest = (
      pesanLower.includes('/tpaccept') ||
      pesanLower.includes('wants you to teleport') ||
      pesanLower.includes('has requested to teleport') ||
      pesanLower.includes('permintaan teleport') ||
      pesanLower.includes('permintaan tpa')
    )
    if (isTpaRequest) {
      console.log(`[☄️ TPA ${USERNAME}]: ${pesanChat}`)
      kirimWebhookLog(`🔔 **PERMINTAAN TPA MASUK!**\n> ${pesanChat}`, 15105570)
    }
  })

  // 🟢 SAAT SPAWN KE DUNIA
  bot.on('spawn', () => {
    sedangReconnect = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    console.log(`[🟢 ${USERNAME}] Berhasil masuk dunia game Minecraft!`)
    kirimWebhookLog(`🟢 **ONLINE** - ${USERNAME} berhasil masuk & spawn ke dalam server.`, 3066993)

    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.allow1by1towers = false
    bot.pathfinder.setMovements(defaultMove)

    setTimeout(() => {
      safeChat(`/login ${PASSWORD_BOT}`, 600)
    }, 3000)

    setTimeout(perbaruiSystemMonitor, 5000)
  })

  // ☠️ AUTO-HOME JIKA MATI
  bot.on('death', () => {
    wasDead = true
    console.log(`[☠️ ${USERNAME}] Bot mati/tereliminasi. Bersiap respawn & auto-home...`)
    kirimWebhookLog(`⚠️ **BOT MATI** - ${USERNAME} mati. Menyiapkan respawn dan /home 1...`, 15158332)
  })

  bot.on('respawn', () => {
    if (wasDead) {
      wasDead = false
      setTimeout(() => {
        safeChat('/home 1', 500)
        console.log(`[🏠 ${USERNAME}] Auto-home kembali ke lokasi /home 1`)
      }, 3500)
    }
  })

  // ⚠️ KICK / DISCONNECT
  bot.on('kicked', (reason, loggedIn) => {
    const alasan = formatReason(reason)
    console.log(`\n[⚠️ KICKED ${USERNAME}] Alasan: ${alasan}`)
    kirimWebhookLog(`⚠️ **KICKED** - Bot di-kick:\n\`\`\`\n${potongLog(alasan, 1000)}\n\`\`\``, 15105570)
    jadwalkanReconnect('Bot di-kick server')
  })

  bot.on('end', (reason) => {
    const alasan = formatReason(reason)
    console.log(`[🔴 DISCONNECTED ${USERNAME}] Alasan: ${alasan}`)
    kirimWebhookLog(`🔴 **TERPUTUS** - Koneksi terputus: ${alasan}`, 15158332)
    if (timerRestartCheck) {
      clearInterval(timerRestartCheck)
      timerRestartCheck = null
    }
    jadwalkanReconnect('Koneksi terputus')
  })

  bot.on('error', (err) => {
    console.log(`[❌ ERROR ${USERNAME}]: ${err.message}`)
    jadwalkanReconnect('Error koneksi')
  })

  bot.on('resourcePack', () => {
    try { bot.acceptResourcePack() } catch (_) {}
  })
}

// =========================================================================
// 🔘 INTERACTIVE DISCORD BUTTONS
// =========================================================================
discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return
  const customId = interaction.customId
  if (!customId.endsWith('_' + USERNAME)) return

  if (!bot || !bot.entity) {
    await interaction.reply({ content: `❌ Bot **${USERNAME}** sedang offline atau belum spawn!`, flags: 64 })
    return
  }

  if (customId.startsWith('btn_pos_')) {
    const pos = bot.entity.position
    await interaction.reply({
      content: `📍 Posisi **${USERNAME}**: **X: ${Math.floor(pos.x)} | Y: ${Math.floor(pos.y)} | Z: ${Math.floor(pos.z)}**`,
      flags: 64
    })
  } else if (customId.startsWith('btn_stop_')) {
    bot.pathfinder.setGoal(null)
    await interaction.reply({ content: `🛑 **${USERNAME}** berhenti bergerak.`, flags: 64 })
  } else if (customId.startsWith('btn_maju_')) {
    const pos = bot.entity.position
    const yaw = bot.entity.yaw
    const depanX = Math.round(pos.x - Math.sin(yaw))
    const depanZ = Math.round(pos.z - Math.cos(yaw))
    bot.pathfinder.setGoal(new GoalXYZ(depanX, Math.round(pos.y), depanZ))
    await interaction.reply({ content: `🏃 **${USERNAME}** melangkah maju 1 blok.`, flags: 64 })
  }
})

// =========================================================================
// 💬 CHAT DARI CHANNEL DISCORD
// =========================================================================
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== CHANNEL_CHAT_DARI_DISCORD) return
  const inputTeks = message.content.trim()
  if (!inputTeks || !bot) return

  // Perintah khusus spam dari Discord
  if (inputTeks.toLowerCase().startsWith('!spam ')) {
    const pesanSpam = inputTeks.slice(6).trim()
    startSpam(pesanSpam, 35, true)
    await message.reply(`📢 Spam chat dimulai untuk **${USERNAME}**! (Jeda: 35s)`)
    return
  }

  if (inputTeks.toLowerCase() === '!stopspam' || inputTeks.toLowerCase() === '!stop') {
    stopSpam()
    await message.reply(`🛑 Spam chat untuk **${USERNAME}** dihentikan.`)
    return
  }

  // Perintah game langsung
  if (inputTeks.startsWith('/')) {
    safeChat(inputTeks)
    await message.react('✅')
    return
  }
})

// =========================================================================
// ⌨️ KONTROL TERMINAL / CMD (LANGSUNG KETIK DI CMD PC KAMU)
// =========================================================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.on('line', (line) => {
  const input = line.trim()
  if (!input) return

  // 1. Perintah SPAM
  if (input.toLowerCase().startsWith('spam ')) {
    const isiPesan = input.slice(5).trim()
    startSpam(isiPesan, 35, true)
  }
  else if (input.toLowerCase() === 'stopspam' || input.toLowerCase() === 'stop') {
    stopSpam()
  }
  // 2. Perintah CEK STATUS
  else if (input.toLowerCase() === 'status') {
    const pos = (bot && bot.entity) ? `X:${Math.floor(bot.entity.position.x)} Y:${Math.floor(bot.entity.position.y)} Z:${Math.floor(bot.entity.position.z)}` : 'Offline'
    console.log(`\n📊 [STATUS ${USERNAME}]`)
    console.log(`• Status: ${(bot && bot.entity) ? '🟢 ONLINE' : '🔴 OFFLINE'}`)
    console.log(`• Posisi: ${pos}`)
    console.log(`• Spam: ${isSpamming ? `📢 AKTIF (${spamDelay}s)` : '🛑 NONAKTIF'}\n`)
  }
  // 3. Perintah BANTUAN
  else if (input.toLowerCase() === 'help') {
    console.log(`\n📖 [PANDUAN KONTROL TERMINAL]`)
    console.log(`• spam <pesan>   ➜ Mulai spam chat dengan pesan yang kamu ketik`)
    console.log(`• stopspam       ➜ Hentikan spam chat`)
    console.log(`• status         ➜ Cek status online & koordinat bot`)
    console.log(`• /<perintah>    ➜ Kirim perintah ke server (contoh: /home 1, /server ecocpvp)\n`)
  }
  // 4. Perintah MINECRAFT BEBAS (/home, /server, dll)
  else if (input.startsWith('/')) {
    safeChat(input)
  }
  else {
    safeChat(input)
  }
})

// =========================================================================
// 🚀 INISIALISASI & JALANKAN
// =========================================================================
console.log('===============================================================')
console.log(`  🤖 MRBOT PC STANDALONE - AKUN KHUSUS: [${USERNAME}]`)
console.log('===============================================================')
console.log(`• Server Target : ${HOST}:${PORT}`)
console.log(`• Akun Bot      : ${USERNAME}`)
console.log(`• Petunjuk      : Ketik 'spam <pesan>' di sini untuk mulai spam.`)
console.log(`• Bantuan       : Ketik 'help' untuk melihat daftar perintah.`)
console.log('===============================================================\n')

discordClient.login(DISCORD_BOT_TOKEN)
  .then(() => {
    console.log(`[Discord] Bridge aktif untuk [${USERNAME}]`)
    createMinecraftBot()
    setInterval(perbaruiSystemMonitor, 60000)
  })
  .catch((err) => {
    console.log(`[Discord] Login bypass (${err.message}). Menjalankan bot Minecraft...`)
    createMinecraftBot()
  })
