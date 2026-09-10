const mineflayer = require('mineflayer')
const os = require('os')
const fs = require('fs')
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')

// ==== 🧭 PUSTAKA NAVIGASI TAMBAHAN ====
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const GoalXYZ = goals.GoalXYZ
const GoalFollow = goals.GoalFollow

// ==== 🎮 KONFIGURASI SERVER MINECRAFT ====
const HOST = 'be.relxmc.com'
const PORT = 25565
const PASSWORD_BOT = process.env.MC_PASSWORD || 'bots1223'

// ==== 👤 PENGATURAN USERNAME DINAMIS ====
const USERNAME = process.argv[2]
if (!USERNAME) {
  console.log('❌ Ralat: Nama akun belum diisi!')
  process.exit(1)
}

// =========================================================================
// 🔗 PENGURUSAN DISCORD APPLICATION BOT
// =========================================================================
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''
const URL_MONITOR_SYSTEM = process.env.DISCORD_MONITOR_WEBHOOK || 'https://discord.com/api/webhooks/1547438909099610182/_PXNoIpa0OLtCwxiEnIAUUOAIuOuSoumbt_6bgKzMwfnSIzIJvrCI8zOf0leVW2M6BzJ'
const URL_LOGS_AFK = process.env.DISCORD_LOG_WEBHOOK || 'https://discord.com/api/webhooks/1547438381955293185/kgdO1Fgudc4dlEvdvggJEoUv9jB3T6fOiaCYaeby5QKEprF1I7mUxchAV5oV8l5jLoFI'
const CHANNEL_CHAT_DARI_DISCORD = process.env.DISCORD_CHANNEL_ID || '1547261418020143176'
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

// ---- FUNGSI PEMBANTU: SAFE CHAT ----
function safeChat(pesan, delayMs = 500) {
  if (!bot || !bot.chat) return

  setTimeout(() => {
    if (!bot || !bot.chat) return

    try {
      bot.chat(pesan)
    } catch (e) {
      console.log('Gagal menghantar sembang:', e.message)
    }
  }, delayMs)
}

// ---- FORMAT ALASAN KICK / DISCONNECT ----
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
      if (typeof reason.text === 'string' && reason.text) {
        return reason.text
      }

      if (Array.isArray(reason.extra)) {
        return reason.extra.map(x => formatReason(x)).join('')
      }

      if (reason.translate) {
        let result = reason.translate
        if (Array.isArray(reason.with)) {
          result += ' ' + reason.with.map(x => formatReason(x)).join(' ')
        }
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

// ---- JADWALKAN RECONNECT HANYA SEKALI ----
function jadwalkanReconnect(alasan = 'Koneksi terputus') {
  if (sengajaBerhenti) return
  if (reconnectTimer) return

  sedangReconnect = true

  console.log(`[🔄 ${USERNAME}] ${alasan}. Reconnect dalam 12 detik...`)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    createMinecraftBot()
  }, 12000)
}

// ---- 1. FUNGSI LOGS DISCORD ----
function kirimWebhookLog(pesan, warna = 16777215) {
  if (
    !URL_LOGS_AFK ||
    URL_LOGS_AFK.includes('TAMPAL_URL') ||
    URL_LOGS_AFK.includes('GANTI_')
  ) {
    return
  }

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
  }).catch(err => {
    console.log('❌ Gagal kirim log webhook:', err.message)
  })
}

// ---- 2. FUNGSI BAR RAM ----
function buatProgressBar(persen) {
  const totalKotak = 10
  const terisi = Math.min(
    Math.max(Math.round((persen / 100) * totalKotak), 0),
    totalKotak
  )

  return '■'.repeat(terisi) + '□'.repeat(totalKotak - terisi)
}

// ---- 3. MONITORING BOT AFK & PANEL TOMBOL INTERAKTIF ----
async function perbaruiSystemMonitor() {
  if (
    !URL_MONITOR_SYSTEM ||
    URL_MONITOR_SYSTEM.includes('TAMPAL_URL') ||
    URL_MONITOR_SYSTEM.includes('GANTI_')
  ) {
    return
  }

  const totalRamGB = Number(os.totalmem() / (1024 ** 3)).toFixed(2)
  const freeRamGB = Number(os.freemem() / (1024 ** 3)).toFixed(2)
  const usedRamGB = Number(totalRamGB - freeRamGB).toFixed(2)
  const persenRam = Number(
    (usedRamGB / totalRamGB) * 100
  ).toFixed(0)

  const cpus = os.cpus()
  const modelCpu =
    cpus && cpus.length > 0
      ? cpus[0].model
      : 'CPU tidak diketahui'

  const totalDetik = Math.floor((Date.now() - botStartTime) / 1000)
  const jam = Math.floor(totalDetik / 3600)
  const menit = Math.floor((totalDetik % 3600) / 60)
  const stringUptime = jam + 'j ' + menit + 'm'

  let latensiServer = '0ms'

  if (
    bot &&
    bot.player &&
    bot.player.ping !== undefined
  ) {
    latensiServer = bot.player.ping + 'ms'
  }

  const statusOnline =
    bot && bot.entity
      ? '🟢 **STATUS: ONLINE & RUNNING 24/7**'
      : '🔴 **STATUS: OFFLINE / CONNECTING**'

  const embedData = {
    embeds: [{
      title: '🖥️ BOT MONITOR - ' + USERNAME,
      description:
        statusOnline +
        '\n\n**⚙️ RESOURCE COMPUTER**',
      color: bot && bot.entity ? 3066993 : 15158332,
      fields: [
        {
          name: '🌐 GAME NETWORK',
          value:
            '**Latency:** `' +
            latensiServer +
            '` ┃ **Uptime Bot:** `' +
            stringUptime +
            '`',
          inline: false
        },
        {
          name: '⚙️ COMPUTER RESOURCE',
          value:
            '`' + modelCpu + '`\n' +
            '`[' + buatProgressBar(persenRam) + ']` ' +
            persenRam +
            '% ┃ ' +
            usedRamGB +
            ' / ' +
            totalRamGB +
            ' GB',
          inline: false
        }
      ],
      footer: {
        text:
          '🟢 REAL-TIME • Panel Tombol & Perintah Lengkap • ' +
          new Date().toLocaleTimeString('id-ID') +
          ' WIB'
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
      const res = await fetch(
        URL_MONITOR_SYSTEM + '?wait=true',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ...embedData, components: [rowButtons.toJSON()] })
        }
      )

      if (res.ok) {
        const d = await res.json()
        pesanMonitorId = d.id

        fs.writeFileSync(
          pathFileId,
          pesanMonitorId,
          'utf8'
        )
      }
    } else {
      await fetch(
        URL_MONITOR_SYSTEM + '/messages/' + pesanMonitorId,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ...embedData, components: [rowButtons.toJSON()] })
        }
      )
    }
  } catch (error) {
    console.log('Monitor error:', error.message)
  }
}

// ==== LOGIK UTAMA SAMBUNGAN MINECRAFT ====
function createMinecraftBot() {
  if (sengajaBerhenti) return

  if (bot) {
    try {
      bot.removeAllListeners()
    } catch (_) {}
  }

  console.log(
    '[!] Menghubungkan ' +
    USERNAME +
    ' ke server Minecraft...'
  )

  sudahLoginSukses = false

  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: false,
    auth: 'offline',
    hideErrors: true,
    checkTimeoutInterval: 60 * 1000
  })

  bot.loadPlugin(pathfinder)

  // 🛡️ WATCHDOG PENGAMAN
  const watchdogInterval = setInterval(() => {
    if (sengajaBerhenti) {
      clearInterval(watchdogInterval)
      return
    }
    if ((!bot || !bot.entity) && !reconnectTimer && !sedangReconnect) {
      console.log(`[⚠️ WATCHDOG ${USERNAME}] Bot mangkrak/mati total. Memaksa reconnect...`)
      clearInterval(watchdogInterval)
      jadwalkanReconnect('Watchdog paksa reconnect')
    }
  }, 30000)

  // 💬 MEMBACA CHAT GAME & LOGGER DISCORD
  bot.on('message', (jsonMsg) => {
    const pesanChat = jsonMsg.toString().trim()

    if (!pesanChat) return

    const pesanLower = pesanChat.toLowerCase()
    const usernameLower = USERNAME.toLowerCase()

    // ---- AUTO LOGIN / AUTO SERVER ----
    if (
      /berhasil/i.test(pesanChat) ||
      /sukses/i.test(pesanChat) ||
      /welcome/i.test(pesanChat) ||
      /selamat datang/i.test(pesanChat)
    ) {
      if (!sudahLoginSukses) {
        sudahLoginSukses = true

        console.log(
          '[🤖 ' +
          USERNAME +
          '] Login dikesan sukses. Memulakan perpindahan sub-server...'
        )

        setTimeout(() => {
          safeChat('/server ecocpvp', 500)

          kirimWebhookLog(
            '🚀 **AUTO SERVER** - Mengalihkan akun ke sub-server `ecocpvp`.',
            16776960
          )
        }, 5000)

        return
      }
    }

    // ---- DETEKSI RESTART SERVER / MAINTENANCE (MT) ----
    if (
      /restart/i.test(pesanChat) ||
      /server closed/i.test(pesanChat) ||
      /sedang dimatikan/i.test(pesanChat) ||
      /fallback/i.test(pesanChat) ||
      /pindah ke hub/i.test(pesanChat) ||
      /maintenance/i.test(pesanChat)
    ) {
      console.log(
        '[⚠️ WARNING] Server Ecocpvp restart/maintenance: ' +
        pesanChat
      )

      kirimWebhookLog(
        '🔄 **SERVER RESTART/MT DETECTED** - Server sedang restart/maintenance. Bersedia masuk semula.',
        15105570
      )

      if (timerRestartCheck) {
        clearInterval(timerRestartCheck)
      }

      timerRestartCheck = setInterval(() => {
        if (bot && bot.chat) {
          safeChat('/server ecocpvp', 300)

          console.log(
            '[🤖 ' +
            USERNAME +
            '] Cuba masuk semula via /server ecocpvp...'
          )
        }
      }, 18000)
    }

    // ---- DETEKSI BERHASIL KEMBALI KE ECOCPVP ----
    if (
      /ecocpvp/i.test(pesanChat) &&
      (
        /terhubung/i.test(pesanChat) ||
        /menyambung/i.test(pesanChat) ||
        /masuk/i.test(pesanChat)
      )
    ) {
      if (timerRestartCheck) {
        clearInterval(timerRestartCheck)
        timerRestartCheck = null

        console.log(
          '[✅ SUCCESS] Bot berhasil kembali ke dunia Ecocpvp!'
        )

        kirimWebhookLog(
          '🟢 **RE-CONNECT SUCCESS** - Bot berhasil masuk kembali ke lobi `ecocpvp`.',
          3066993
        )
      }
    }

    if (
      pesanLower.includes('/login') ||
      pesanLower.includes('/register') ||
      pesanLower.includes('sandi')
    ) {
      return
    }

    // ---- DETEKSI TPA ----
    const isTpaExclude = 
      pesanLower.includes("don't have a pending") ||
      pesanLower.includes("tidak ada permintaan") ||
      pesanLower.includes("teleporting...") ||
      pesanLower.includes("teleportasi berhasil") ||
      pesanLower.includes("teleportation complete") ||
      pesanLower.includes("accepted teleport") ||
      pesanLower.includes("permintaan teleportasi diterima")

    const isTpaRequest = !isTpaExclude && (
      pesanLower.includes('/tpaccept') ||
      pesanLower.includes('tpaccept') ||
      pesanLower.includes('/tpdeny') ||
      pesanLower.includes('tpdeny') ||
      pesanLower.includes('wants you to teleport') ||
      pesanLower.includes('wants to teleport') ||
      pesanLower.includes('has requested to teleport') ||
      pesanLower.includes('click to accept') ||
      pesanLower.includes('permintaan teleport') ||
      pesanLower.includes('permintaan tpa') ||
      pesanLower.includes('mengirim tpa') ||
      pesanLower.includes('ingin teleport') ||
      pesanLower.includes('ingin berteleportasi') ||
      pesanLower.includes('meminta teleportasi') ||
      pesanLower.includes('meminta untuk teleport') ||
      (pesanLower.includes('tpa') && (pesanLower.includes('accept') || pesanLower.includes('request') || pesanLower.includes('ke kamu') || pesanLower.includes('dari')))
    )

    if (isTpaRequest) {
      kirimWebhookLog(
        '🔔 **PERMINTAAN TELEPORTASI DETECTED!**\n```' +
        potongLog(pesanChat, 3400) +
        '```',
        15105570
      )
      return
    }

    if (pesanLower.includes(usernameLower)) {
      kirimWebhookLog(
        '📌 **NAMA BOT DI-TAG/MENTION!**\n```' +
        potongLog(pesanChat, 3400) +
        '```',
        16776960
      )
      return
    }

    if (
      pesanLower.includes('bisikan') ||
      pesanLower.includes('whispers') ||
      pesanLower.includes('-> me')
    ) {
      kirimWebhookLog(
        '✉️ **PESAN PRIBADI (PM) MASUK!**\n```' +
        potongLog(pesanChat, 3400) +
        '```',
        3447003
      )
    }
  })

  // ---- SPAWN ----
  bot.on('spawn', () => {
    sedangReconnect = false

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    console.log(
      '[🟢 ' +
      USERNAME +
      '] Berhasil masuk dunia game Minecraft!'
    )

    kirimWebhookLog(
      '🟢 **ONLINE** - Berhasil masuk & spawn ke dalam server.',
      3066993
    )

    const defaultMove = new Movements(bot)
    defaultMove.canDig = false
    defaultMove.allow1by1towers = false

    bot.pathfinder.setMovements(defaultMove)

    setTimeout(() => {
      perbaruiSystemMonitor()
    }, 5000)

    setTimeout(() => {
      if (!bot || !bot.entity) return

      try {
        bot.look(
          Math.random() * Math.PI,
          0,
          true
        )
      } catch (_) {}

      safeChat(
        '/login ' + PASSWORD_BOT,
        800
      )
    }, 6000)
  })

  // ---- KICK SERVER ----
  bot.on('kicked', (reason, loggedIn) => {
    const alasan = formatReason(reason)

    console.log(
      '\n==================================================\n' +
      '[⚠️ ' +
      USERNAME +
      '] DI-KICK SERVER!\n' +
      'Login: ' +
      loggedIn +
      '\nAlasan: ' +
      alasan +
      '\n=================================================='
    )

    kirimWebhookLog(
      '⚠️ **KICK TERDETEKSI!**\n' +
      '**Login:** `' +
      loggedIn +
      '`\n' +
      '**Alasan server:**\n```' +
      potongLog(alasan, 3400) +
      '```',
      15105570
    )

    jadwalkanReconnect('Bot di-kick server')
  })

  // ---- DISCONNECT ----
  bot.on('end', (reason) => {
    const alasan = formatReason(reason)

    console.log(
      '[🔴 ' +
      USERNAME +
      '] TERPUTUS DARI SERVER!\n' +
      'Alasan: ' +
      alasan
    )

    kirimWebhookLog(
      '🔴 **DISCONNECTED**\n' +
      '**Alasan:**\n```' +
      potongLog(alasan, 3400) +
      '```\n' +
      '🔄 **Mencoba masuk kembali dalam 12 detik...**',
      15158332
    )

    if (timerRestartCheck) {
      clearInterval(timerRestartCheck)
      timerRestartCheck = null
    }

    jadwalkanReconnect(
      'Koneksi Minecraft berakhir'
    )
  })

  // ---- ERROR ----
  bot.on('error', (err) => {
    const detail = err && (
      err.stack ||
      err.message
    )
      ? (err.stack || err.message)
      : String(err)

    console.log(
      '[❌ ' +
      USERNAME +
      '] ERROR:\n' +
      detail
    )

    kirimWebhookLog(
      '❌ **BOT ERROR**\n```' +
      potongLog(detail, 3400) +
      '```',
      15158332
    )

    jadwalkanReconnect('Terjadi bot error')
  })

  // ---- RESOURCE PACK ----
  bot.on('resourcePack', (url, hash) => {
    try {
      bot.acceptResourcePack()
    } catch (e) {
      console.log(
        'Gagal menerima resource pack:',
        e.message
      )
    }
  })
}

// ==== 🔘 PENGURUSAN KLIK TOMBOL INTERAKTIF DISCORD ====
discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return

  const customId = interaction.customId
  if (!customId.endsWith('_' + USERNAME)) return

  if (!bot || !bot.entity) {
    await interaction.reply({ content: `❌ Bot **${USERNAME}** sedang offline atau belum spawn!`, ephemeral: true })
    return
  }

  if (customId.startsWith('btn_pos_')) {
    const pos = bot.entity.position
    await interaction.reply({
      content: `📍 Posisi **${USERNAME}**: **X: ${Math.floor(pos.x)} | Y: ${Math.floor(pos.y)} | Z: ${Math.floor(pos.z)}**`,
      ephemeral: true
    })
  } else if (customId.startsWith('btn_stop_')) {
    bot.pathfinder.setGoal(null)
    await interaction.reply({
      content: `🛑 **${USERNAME}** berhasil dihentikan dari pergerakan.`,
      ephemeral: true
    })
  } else if (customId.startsWith('btn_maju_')) {
    const posSaatIni = bot.entity.position
    const yaw = bot.entity.yaw
    const depanX = Math.round(posSaatIni.x - Math.sin(yaw))
    const depanZ = Math.round(posSaatIni.z - Math.cos(yaw))
    const depanY = Math.round(posSaatIni.y)

    bot.pathfinder.setGoal(new GoalXYZ(depanX, depanY, depanZ))
    await interaction.reply({
      content: `🏃 **${USERNAME}** melangkah maju 1 blok.`,
      ephemeral: true
    })
  }
})

// ==== 💬 LOGIK MENERIMA CHAT & PERINTAH DARI DISCORD ====
discordClient.on(
  'messageCreate',
  async (message) => {
    if (
      message.author.bot ||
      message.channel.id !== CHANNEL_CHAT_DARI_DISCORD
    ) {
      return
    }

    const inputTeks = message.content.trim()

    if (!inputTeks || !bot) return

    // -------------------------------------------------------------
    // A. PERINTAH KHUSUS BOT TERTENTU
    // -------------------------------------------------------------
    if (
      inputTeks
        .toLowerCase()
        .startsWith(USERNAME.toLowerCase() + ':')
    ) {
      const perintah = inputTeks
        .slice(USERNAME.length + 1)
        .trim()

      // ---- 1. !TPA ----
      if (perintah.toLowerCase().startsWith('!tpa')) {
        const parts = perintah.split(/\s+/)
        const targetPlayer = parts[1]

        if (!targetPlayer) {
          await message.reply('❌ Format salah! Gunakan: `' + USERNAME + ': !tpa NamaPlayer`')
          return
        }

        safeChat('/tpa ' + targetPlayer, 400)
        await message.reply('🛈 **' + USERNAME + '** mengirim permintaan TPA ke **' + targetPlayer + '**.')
        return
      }

      // ---- 2. !GOTO ----
      if (perintah.startsWith('!goto')) {
        const parts = perintah.split(/\s+/)
        const x = parseInt(parts[1])
        const y = parseInt(parts[2])
        const z = parseInt(parts[3])

        if (isNaN(x) || isNaN(y) || isNaN(z)) {
          await message.reply('❌ Format salah! Gunakan: `' + USERNAME + ': !goto X Y Z`')
          return
        }

        bot.pathfinder.setGoal(new GoalXYZ(x, y, z))
        await message.reply('🏃 **' + USERNAME + '** berjalan menuju **X:' + x + ' Y:' + y + ' Z:' + z + '**...')
        return
      }

      // ---- 3. !FOLLOW ----
      if (perintah === '!follow') {
        const target = bot.nearestEntity(
          entity => entity.type === 'player' && entity.username !== USERNAME
        )

        if (!target) {
          await message.reply('❌ Tidak ada player lain yang terdeteksi di sekitar bot.')
          return
        }

        bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
        await message.reply('🤝 **' + USERNAME + '** mulai mengikuti **' + target.username + '**!')
        return
      }

      // ---- 4. !STOP ----
      if (perintah === '!stop') {
        bot.pathfinder.setGoal(null)
        await message.reply('🛑 **' + USERNAME + '** telah berhenti bergerak.')
        return
      }

      // ---- 5. !COORDS / !POS ----
      if (perintah === '!coords' || perintah === '!pos') {
        if (!bot.entity) {
          await message.reply('❌ Bot belum berada di dunia Minecraft.')
          return
        }

        const pos = bot.entity.position
        await message.reply('📍 Posisi **' + USERNAME + '**: **X: ' + Math.floor(pos.x) + ' | Y: ' + Math.floor(pos.y) + ' | Z: ' + Math.floor(pos.z) + '**')
        return
      }

      // ---- PERINTAH LAINNYA KE SERVER ----
      safeChat(perintah, 400)
      return
    }

    // -------------------------------------------------------------
    // B. PERINTAH MASSAL (SEMUA)
    // -------------------------------------------------------------
    if (inputTeks.toLowerCase().startsWith('semua:')) {
      const perintahSemua = inputTeks.slice(6).trim()
      if (perintahSemua === '!stop') {
        bot.pathfinder.setGoal(null)
        await message.react('🛑')
        return
      }
      safeChat(perintahSemua, 600)
    }
  }
)

// ==== HUBUNGKAN DISCORD API & JALANKAN BOT MINECRAFT ====
discordClient.login(DISCORD_BOT_TOKEN)
  .then(() => {
    console.log(
      '[Discord] Gateway Bridge untuk [' +
      USERNAME +
      '] berhasil dihubungkan.'
    )

    createMinecraftBot()

    setInterval(
      perbaruiSystemMonitor,
      60000
    )
  })
  .catch(err => {
    console.error(
      '❌ Gagal menghubungkan ke Discord Bot Token:',
      err.message
    )
  })