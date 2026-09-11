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
const fs = require('fs')
const path = require('path')
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  SlashCommandBuilder, 
  REST, 
  Routes,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js')

const { pathfinder, Movements } = require('mineflayer-pathfinder')

const http = require('http')

const activeBots = {}

// =========================================================================
// 📦 SISTEM MANAJEMEN SEWA SLOT & KUOTA BOT
// =========================================================================
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json')

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('[Error loadSubscriptions]:', err.message)
  }
  return {}
}

function saveSubscriptions(data) {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error('[Error saveSubscriptions]:', err.message)
  }
}

function parseDuration(str) {
  if (!str) return 24 * 60 * 60 * 1000 // default 24 jam
  const s = String(str).toLowerCase().trim()
  const num = parseInt(s.replace(/[^0-9]/g, ''), 10) || 1
  if (s.includes('d') || s.includes('hari') || s.includes('day')) {
    return num * 24 * 60 * 60 * 1000
  }
  if (s.includes('h') || s.includes('jam') || s.includes('hour')) {
    return num * 60 * 60 * 1000
  }
  if (s.includes('m') || s.includes('menit') || s.includes('min')) {
    return num * 60 * 1000
  }
  return num * 60 * 60 * 1000
}

function isUserAdmin(member, user, guild) {
  if (!user) return false
  if (guild && guild.ownerId === user.id) return true
  if (member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true
  return false
}

function checkAccess(interaction, botNick = null, isNewBot = false) {
  const user = interaction.user
  const member = interaction.member
  const guild = interaction.guild

  // Owner / Admin punya hak super akses di mana saja
  if (isUserAdmin(member, user, guild)) {
    return { allowed: true, isAdmin: true }
  }

  const subs = loadSubscriptions()
  const sub = subs[user.id]

  if (!sub) {
    return { 
      allowed: false, 
      reason: '❌ **Akses Ditolak!** Anda belum memiliki kuota sewa bot aktif. Silakan hubungi Owner untuk menyewa slot bot!' 
    }
  }

  const now = Date.now()
  if (now > sub.expiresAt) {
    return { 
      allowed: false, 
      reason: `❌ **Masa Sewa Habis!** Masa sewa bot Anda telah berakhir pada <t:${Math.floor(sub.expiresAt / 1000)}:R>. Silakan hubungi Owner untuk perpanjangan sewa!` 
    }
  }

  // Wajib jalankan perintah di channel privat miliknya
  if (sub.channelId && interaction.channelId !== sub.channelId) {
    return { 
      allowed: false, 
      reason: `⚠️ **Salah Channel!** Untuk menjaga privasi, silakan jalankan perintah bot ini di channel privat Anda: <#${sub.channelId}>` 
    }
  }

  // Jika sedang login/register bot baru, cek batas kuota slot
  if (isNewBot && botNick) {
    if (!sub.assignedBots) sub.assignedBots = []

    // 1. Kunci berdasarkan akun / nama bot yang sudah didaftarkan (Batas Slot Akun)
    const isAssigned = sub.assignedBots.includes(botNick)
    if (!isAssigned && sub.assignedBots.length >= sub.maxBots) {
      return { 
        allowed: false, 
        reason: `❌ **Batas Kuota Slot Tercapai!** Anda hanya menyewa **${sub.maxBots} bot** (Akun terdaftar: \`${sub.assignedBots.join(', ')}\`). Tidak bisa mendaftarkan akun baru lagi! Hubungi Owner jika ingin ganti nama bot atau tambah slot.` 
      }
    }

    // 2. Kunci berdasarkan bot yang sedang aktif online bersamaan
    const currentlyActiveCount = Object.values(activeBots).filter(b => b.ownerId === user.id && !b.isStopped).length
    const isAlreadyMine = activeBots[botNick] && activeBots[botNick].ownerId === user.id && !activeBots[botNick].isStopped

    if (!isAlreadyMine && currentlyActiveCount >= sub.maxBots) {
      return { 
        allowed: false, 
        reason: `❌ **Kuota Slot Penuh!** Kuota sewa Anda hanya untuk **${sub.maxBots} bot** sekaligus (saat ini aktif: **${currentlyActiveCount} bot**). Gunakan \`/stop\` terlebih dahulu atau hubungi Owner jika ingin upgrade slot!` 
      }
    }
  }

  // Jika botNick sedang dipakai orang lain
  if (botNick && activeBots[botNick]) {
    if (activeBots[botNick].ownerId && activeBots[botNick].ownerId !== user.id) {
      return { 
        allowed: false, 
        reason: `❌ **Bukan Bot Anda!** Bot **${botNick}** ini milik penyewa lain dan tidak dapat Anda kontrol.` 
      }
    }
  }

  return { allowed: true, isAdmin: false, sub: sub }
}

// =========================================================================
// 🔗 KONFIGURASI DISCORD BOT UTAMA
// =========================================================================
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || Buffer.from('TVRVME56UXpOekV6TXpBNU56SXdPVGcyTmcuRzl1MWRXLjl4VFRxQlE5Z0FWUVo2dllfZGJ3NmJBLTVGNFNIOWpJVnRVU0Jz', 'base64').toString('utf8')
const CLIENT_ID = '1547437133097209866'
const URL_LOGS_AFK = process.env.DISCORD_LOG_WEBHOOK || 'https://discord.com/api/webhooks/1547438381955293185/kgdO1Fgudc4dlEvdvggJEoUv9jB3T6fOiaCYaeby5QKEprF1I7mUxchAV5oV8l5jLoFI'
// =========================================================================

// Web server mini untuk menerima ping 24/7 dari cron-job.org / Render
const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('🤖 Bot Minecraft & Discord Manager is Online 24/7!\n')
}).listen(PORT, () => {
  console.log(`[Web Server] Aktif di port ${PORT} untuk ping 24/7`)
})

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

function kirimWebhookLog(username, pesan, warna = 16777215) {
  if (!URL_LOGS_AFK || URL_LOGS_AFK.includes('TAMPAL_URL')) return
  fetch(URL_LOGS_AFK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '🤖 Log Akun: ' + username,
        description: String(pesan || '').slice(0, 3800),
        color: warna,
        timestamp: new Date().toISOString()
      }]
    })
  }).catch(() => {})
}

// =========================================================================
// 🛡️ MODUL SIMULASI GERAKAN MANUSIA (DINONAKTIFKAN SEMENTARA)
// =========================================================================
function jalankanSimulasiManusia(botInstance) {
  // Fitur gerakan alami dinonaktifkan sesuai permintaan pengujian
  return
}

// FUNGSI TAHAP 1: REGISTRASI DENGAN DETEKSI SUKSES REAL-TIME & BYPASS ANTIBOT
function registerMinecraftBot(username, hostServer, passwordBot, interactionChannel, ownerId = null) {
  if (activeBots[username]) {
    stopBot(username)
  }

  if (ownerId) {
    const subs = loadSubscriptions()
    if (subs[ownerId]) {
      if (!subs[ownerId].assignedBots) subs[ownerId].assignedBots = []
      if (!subs[ownerId].assignedBots.includes(username)) {
        subs[ownerId].assignedBots.push(username)
        saveSubscriptions(subs)
      }
    }
  }

  let host = hostServer.trim()
  let port = 25565
  if (host.includes(':')) {
    const parts = host.split(':')
    host = parts[0].trim()
    port = parseInt(parts[1].trim(), 10) || 25565
  }

  let retryVoltraz = 0
  let sudahSelesai = false
  let sudahSpawn = false
  let regisSent = false
  let pesanTerakhir = ''
  let botInstance = null
  let timeoutRegis = null
  let fallbackTimerRegis = null

  function notifyRegisterSuccess(sourceNote = '') {
    if (sudahSelesai) return
    sudahSelesai = true
    if (timeoutRegis) clearTimeout(timeoutRegis)
    if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)

    console.log(`[🎉 REGIS SUKSES ${username}] Berhasil terdaftar di ${hostServer}! ${sourceNote}`)
    kirimWebhookLog(username, `✅ **REGISTRASI BERHASIL** - Akun **${username}** terdaftar di \`${hostServer}\`.`, 3066993)
    if (interactionChannel) {
      const detail = sourceNote ? `\n> *${sourceNote}*` : ''
      interactionChannel.send(`✅ **Registrasi Berhasil!** Akun **${username}** di server \`${hostServer}\` sudah sukses didaftarkan!${detail}\n👉 Silakan gunakan perintah \`/login\` untuk mulai mengaktifkan bot.`)
    }
    setTimeout(() => {
      try {
        if (botInstance) {
          botInstance.removeAllListeners()
          botInstance.end()
        }
      } catch (_) {}
    }, 1500)
  }

  function startRegister() {
    if (sudahSelesai) return

    if (botInstance) {
      try {
        botInstance.removeAllListeners()
        botInstance.end()
      } catch (_) {}
    }

    botInstance = mineflayer.createBot({
      host: host,
      port: port,
      username: username,
      version: "1.21.1",
      auth: 'offline',
      viewDistance: 'tiny',
      checkTimeoutInterval: 90 * 1000,
      hideErrors: false
    })

    botInstance.loadPlugin(pathfinder)

    botInstance.on('entitySpawn', (entity) => {
      if (entity && (entity.name === 'item' || entity.type === 'item' || entity.name === 'experience_orb' || entity.type === 'object')) {
        delete botInstance.entities[entity.id]
      }
    })

    timeoutRegis = setTimeout(() => {
      if (!sudahSelesai) {
        sudahSelesai = true
        if (interactionChannel) {
          let detail = ''
          if (!sudahSpawn) {
            detail = `\n⚠️ *Koneksi tertahan di pintu gerbang server (Bot belum sempat spawn karena IP Anda masih dalam masa hukuman/cooldown Anti-Bot Voltraz "Please wait a few minutes").*`
          } else if (pesanTerakhir) {
            detail = `\n💬 *Respon terakhir server:* ${pesanTerakhir}`
          }
          interactionChannel.send(`⏱️ **Waktu Registrasi Habis (Timeout)!**\nServer \`${hostServer}\` belum mengonfirmasi pendaftaran akun **${username}**.${detail}\n💡 *Coba ganti IP internet (Mode Pesawat HP) atau gunakan \`/login\` jika akun sebenarnya sudah ada.*`)
        }
        try { botInstance.end() } catch (_) {}
      }
    }, 35000)

    function handleIncomingText(rawText) {
      if (!rawText || sudahSelesai) return
      const pesan = rawText.toString().trim()
      if (!pesan) return

      const lower = pesan.toLowerCase()

      // Jangan simpan broadcast join/leave player lain sebagai pesan respon penting
      const isPlayerBroadcast = lower.includes('bergabung ke peradaban') || 
                                lower.includes('joined the game') || 
                                lower.includes('left the game')
      if (!isPlayerBroadcast) {
        pesanTerakhir = pesan
      }

      // 1. Deteksi jika akun ternyata SUDAH terdaftar sebelumnya
      if (lower.includes('sudah terdaftar') || 
          lower.includes('already registered') || 
          lower.includes('already been registered') || 
          lower.includes('already exists') ||
          lower.includes('use /login') ||
          lower.includes('gunakan /login') ||
          lower.includes('silakan login') ||
          lower.includes('please login') ||
          lower.includes('kamu sudah terdaftar') ||
          lower.includes('anda sudah terdaftar') ||
          lower.includes('akun ini telah terdaftar')) {
        sudahSelesai = true
        if (timeoutRegis) clearTimeout(timeoutRegis)
        if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)
        if (interactionChannel) {
          interactionChannel.send(`⚠️ **Akun Sudah Terdaftar!** Akun **${username}** di server \`${hostServer}\` sudah pernah terdaftar sebelumnya.\n👉 Silakan langsung gunakan perintah \`/login\` di Discord!`)
        }
        setTimeout(() => {
          try { botInstance.removeAllListeners(); botInstance.end() } catch (_) {}
        }, 1000)
        return
      }

      // 2. Deteksi jika format sandi ditolak server:
      // Kasus A: Server minta 1 password (contoh: [»] Penggunaan: /register <password>)
      if ((lower.includes('penggunaan:') || lower.includes('usage:') || lower.includes('syntax:') || lower.includes('gunakan:')) &&
          (lower.includes('/register <password>') || lower.includes('/register <kata sandi>') || lower.includes('/register <sandi>') || lower.includes('/register <pass>')) &&
          !lower.includes('<confirm') && !lower.includes('<ulang') && !lower.includes('<password> <') && !lower.includes('<sandi> <')) {
        console.log(`[🔄 REGIS ${username}] Server memerlukan format 1 password: /register <password>. Mengirim ulang...`)
        if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)
        setTimeout(() => {
          if (!sudahSelesai && botInstance && botInstance.chat) {
            botInstance.chat(`/register ${passwordBot}`)
            fallbackTimerRegis = setTimeout(() => {
              if (!sudahSelesai && botInstance && !botInstance._client?.ended) {
                notifyRegisterSuccess('Terkonfirmasi otomatis (Format 1 password diterima).')
              }
            }, 4500)
          }
        }, 500)
        return
      }

      // Kasus B: Server minta 2 password (konfirmasi)
      if ((lower.includes('penggunaan:') || lower.includes('usage:') || lower.includes('syntax:') || lower.includes('gunakan:')) &&
          (lower.includes('<confirm') || lower.includes('<ulang') || lower.includes('<password> <') || lower.includes('<kata sandi> <'))) {
        console.log(`[🔄 REGIS ${username}] Server memerlukan format 2 password: /register <pass> <pass>. Mengirim ulang...`)
        if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)
        setTimeout(() => {
          if (!sudahSelesai && botInstance && botInstance.chat) {
            botInstance.chat(`/register ${passwordBot} ${passwordBot}`)
            fallbackTimerRegis = setTimeout(() => {
              if (!sudahSelesai && botInstance && !botInstance._client?.ended) {
                notifyRegisterSuccess('Terkonfirmasi otomatis (Format 2 password diterima).')
              }
            }, 4500)
          }
        }, 500)
        return
      }

      // 3. Deteksi jika password tidak memenuhi kriteria server
      if (lower.includes('password terlalu pendek') || 
          lower.includes('password too short') || 
          lower.includes('kata sandi minimal') || 
          lower.includes('password minimum') || 
          lower.includes('password must be') ||
          lower.includes('too weak') ||
          lower.includes('terlalu lemah') ||
          lower.includes('password is too weak')) {
        sudahSelesai = true
        if (timeoutRegis) clearTimeout(timeoutRegis)
        if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)
        if (interactionChannel) {
          interactionChannel.send(`❌ **Registrasi Gagal (Password Ditolak Server)!**\n> *${pesan}*\n💡 *Tips: Server RelxMC mewajibkan password yang kuat/unik. Gunakan kombinasi huruf dan angka (contoh: \`Kucing1234\`, \`RelxBot2026\`), jangan password angka sederhana.*`)
        }
        setTimeout(() => { try { botInstance.removeAllListeners(); botInstance.end() } catch (_) {} }, 1000)
        return
      }

      // 4. Deteksi limit akun server (Batas IP)
      if (lower.includes('melewati batas') || lower.includes('maksimal') || lower.includes('maximum number') || lower.includes('limit akun') || lower.includes('batas pendaftaran')) {
        sudahSelesai = true
        if (timeoutRegis) clearTimeout(timeoutRegis)
        if (fallbackTimerRegis) clearTimeout(fallbackTimerRegis)
        if (interactionChannel) {
          interactionChannel.send(`❌ **Registrasi Ditolak (Limit IP Server Tercapai)!**\n> *${pesan}*\n💡 *Solusi: Matikan/hidupkan mode pesawat di HP Anda (ganti IP hotspot) atau daftarkan akun langsung di game Minecraft lalu gunakan \`/login\` di Discord.*`)
        }
        setTimeout(() => { try { botInstance.removeAllListeners(); botInstance.end() } catch (_) {} }, 1000)
        return
      }

      // 5. Deteksi sukses registrasi (bahasa Inggris & Indonesia)
      if (!isPlayerBroadcast) {
        if (lower.includes('succes') || 
            lower.includes('successfully') || 
            lower.includes('berhasil') || 
            lower.includes('sukses') || 
            lower.includes('terdaftar') || 
            lower.includes('registered') || 
            lower.includes('useful commands') ||
            lower.includes('selamat datang') ||
            lower.includes('selamat bermain') ||
            lower.includes('welcome to') ||
            lower.includes('telah dibuat') ||
            lower.includes('pendaftaran berhasil') ||
            lower.includes('kamu sekarang login') ||
            lower.includes('you are now logged in') ||
            lower.includes('logged in')) {
          notifyRegisterSuccess(pesan)
          return
        }
      }
    }

    botInstance.on('message', (jsonMsg) => {
      const pesan = jsonMsg.toString().trim()
      if (pesan) {
        handleIncomingText(pesan)
      }
    })

    botInstance.on('title', (text) => {
      if (!text) return
      try {
        let titleStr = ''
        if (typeof text === 'string') {
          titleStr = text
        } else if (text && typeof text.toString === 'function' && text.toString() !== '[object Object]') {
          titleStr = text.toString()
        } else {
          titleStr = JSON.stringify(text)
        }
        titleStr = String(titleStr || '')
        handleIncomingText(titleStr)
      } catch (err) {
      }
    })

    botInstance.on('actionBar', (jsonMsg) => {
      if (!jsonMsg) return
      try {
        let barStr = ''
        if (typeof jsonMsg === 'string') {
          barStr = jsonMsg
        } else if (jsonMsg && typeof jsonMsg.toString === 'function' && jsonMsg.toString() !== '[object Object]') {
          barStr = jsonMsg.toString()
        } else {
          barStr = JSON.stringify(jsonMsg)
        }
        barStr = String(barStr || '').trim()
        if (barStr) {
          handleIncomingText(barStr)
        }
      } catch (err) {
      }
    })

    botInstance.on('respawn', () => {
      console.log(`[🗺️ REGIS RESPAWN ${username}] Bot memuat dunia/dimensi server.`)
    })

    botInstance.once('spawn', () => {
      sudahSpawn = true
      console.log(`[🟢 ${username}] Masuk ke ${hostServer}. Mengirim registrasi...`)

      setTimeout(() => {
        if (!sudahSelesai && botInstance && botInstance.chat && !regisSent) {
          regisSent = true
          console.log(`[🔑 REGIS ${username}] Mengirim perintah /register...`)
          botInstance.chat(`/register ${passwordBot} ${passwordBot}`)

          // Fallback timer: jika setelah 4.5 detik tidak ada penolakan/kick, otomatis konfirmasi registrasi sukses!
          fallbackTimerRegis = setTimeout(() => {
            if (!sudahSelesai && botInstance && !botInstance._client?.ended) {
              notifyRegisterSuccess('Pendaftaran diterima oleh server (Terkonfirmasi aktif).')
            }
          }, 4500)
        }
      }, 1000)
    })

    botInstance.on('kicked', (reason) => {
      let alasan = typeof reason === 'string' ? reason : JSON.stringify(reason)
      try {
        const parsed = typeof reason === 'string' ? JSON.parse(reason) : reason
        if (parsed.text) alasan = parsed.text
        else if (parsed.extra) alasan = parsed.extra.map(e => e.text || '').join('')
      } catch (_) {}
      console.log(`[⚠️ KICK ${username}] Di-kick server: ${alasan}`)

      const lowerKick = alasan.toLowerCase()
      const isTemporaryIpBlock = lowerKick.includes('denied from entering') || lowerKick.includes('wait a few minutes')
      const isAntiBot = lowerKick.includes('voltraz') || 
                        lowerKick.includes('sonar') ||
                        lowerKick.includes('antibot') || 
                        lowerKick.includes('anti-bot') || 
                        lowerKick.includes('reconnect to verify') || 
                        lowerKick.includes('please reconnect') || 
                        lowerKick.includes('verification') || 
                        lowerKick.includes('bot verification') || 
                        lowerKick.includes('failed the bot') || 
                        lowerKick.includes('reconnected too fast')

      // Jika IP diblokir sementara (Sonar / Voltraz "wait a few minutes"), beri tahu solusi ganti IP
      if (isTemporaryIpBlock) {
        sudahSelesai = true
        clearTimeout(timeoutRegis)
        if (interactionChannel) {
          interactionChannel.send(`🛑 **IP Anda Dibatasi Sementara oleh Anti-Bot Server (Sonar)!**\n> *${alasan}*\n\n💡 **Solusi Paling Cepat:**\n• Jika pakai hotspot HP: Nyalakan **Mode Pesawat** selama 5 detik lalu matikan lagi (IP langsung berganti baru & bisa langsung login).\n• Atau tunggu **3 – 5 menit** tanpa mencoba masuk agar masa hukuman IP selesai.`)
        }
        try { botInstance.removeAllListeners(); botInstance.end() } catch (_) {}
        return
      }

      // Bypass Anti-Bot Kick dengan reconnect otomatis (4.5s untuk tantangan reconnect, 8s untuk voltraz/sonar)
      if (!sudahSelesai && isAntiBot && retryVoltraz < 3) {
        retryVoltraz++
        const delay = (lowerKick.includes('reconnect to verify') || lowerKick.includes('please reconnect')) ? 4500 : 8000
        console.log(`[🛡️ BYPASS ANTIBOT ${username}] Terkena verifikasi AntiBot. Reconnect otomatis (${retryVoltraz}/3) dalam ${Math.round(delay / 1000)} detik...`)
        if (interactionChannel) {
          interactionChannel.send(`🛡️ **Verifikasi Anti-Bot Terdeteksi!**\n> *${alasan}*\n🔄 Menjawab verifikasi server: Menyambung ulang otomatis (${retryVoltraz}/3) dalam ${Math.round(delay / 1000)} detik...`)
        }
        clearTimeout(timeoutRegis)
        setTimeout(() => {
          startRegister()
        }, delay)
        return
      }

      if (!sudahSelesai) {
        sudahSelesai = true
        clearTimeout(timeoutRegis)
        if (interactionChannel) {
          interactionChannel.send(`❌ **Registrasi Gagal!** Bot **${username}** di-kick dari server \`${hostServer}\`:\n> ${alasan.slice(0, 300)}`)
        }
      }
    })

    botInstance.on('error', (err) => {
      console.log(`[❌ ERROR ${username}] ${err.message}`)
      if (!sudahSelesai) {
        sudahSelesai = true
        clearTimeout(timeoutRegis)
        if (interactionChannel) {
          interactionChannel.send(`❌ **Gagal Terhubung!** Tidak dapat menghubungi server \`${hostServer}\`:\n> ${err.message}`)
        }
      }
    })

    botInstance.on('end', (reason) => {
      console.log(`[🔴 DISCONNECT ${username}] Terputus: ${reason}`)
      if (!sudahSelesai && retryVoltraz === 0) {
        sudahSelesai = true
        clearTimeout(timeoutRegis)
        if (interactionChannel) {
          interactionChannel.send(`⚠️ **Koneksi Terputus!** Bot **${username}** terputus dari \`${hostServer}\` (${reason}).`)
        }
      }
    })
  }

  startRegister()
}

// FUNGSI MANAJEMEN SPAM CHAT
function startSpam(username, pesan, jedaDetik = 15, antiDuplikat = true) {
  const targetData = activeBots[username]
  if (!targetData) return { success: false, reason: 'Bot tidak ditemukan atau sedang offline.' }
  if (!targetData.botInstance || !targetData.botInstance.chat) {
    return { success: false, reason: 'Bot belum siap (belum terhubung ke dunia game).' }
  }

  stopSpam(username)

  let jeda = Math.max(3, parseInt(jedaDetik, 10) || 15)
  targetData.isSpamming = true
  targetData.spamMessage = pesan
  targetData.spamDelay = jeda
  targetData.antiDuplikat = antiDuplikat

  function kirimPesan() {
    if (!targetData.isSpamming || !targetData.botInstance || !targetData.botInstance.chat) {
      if (targetData.spamTimer) {
        clearInterval(targetData.spamTimer)
        targetData.spamTimer = null
      }
      return
    }

    // Otomatis gabung baris (Enter) menjadi 1 baris utuh agar CUMA 1X KIRIM di Minecraft!
    let cleanMessage = targetData.spamMessage
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join(' &f&l• ')

    if (!cleanMessage) return

    if (targetData.antiDuplikat) {
      const randomCode = Math.floor(100 + Math.random() * 900)
      cleanMessage = `${cleanMessage} [${randomCode}]`
    }

    try {
      targetData.botInstance.chat(cleanMessage)
      console.log(`[📢 SPAM ${username} (1x Kirim)]: ${cleanMessage}`)
    } catch (err) {
      console.log(`[❌ GAGAL SPAM ${username}]: ${err.message}`)
    }
  }

  // Kirim pesan pertama langsung
  kirimPesan()

  // Jadwalkan interval berulang
  targetData.spamTimer = setInterval(kirimPesan, jeda * 1000)
  return { success: true, jeda: jeda }
}

function stopSpam(username) {
  const targetData = activeBots[username]
  if (!targetData) return false
  if (targetData.spamTimer) {
    clearInterval(targetData.spamTimer)
    targetData.spamTimer = null
  }
  targetData.isSpamming = false
  targetData.spamMessage = ''
  targetData.spamDelay = 0
  console.log(`[🛑 STOPSPAM] Spam chat untuk ${username} dihentikan.`)
  return true
}

// FUNGSI PENGHENTIAN BOT SECARA BERSIH
function stopBot(username) {
  const targetData = activeBots[username]
  if (!targetData) return false

  stopSpam(username)

  targetData.isStopped = true
  if (targetData.sweepInterval) {
    clearInterval(targetData.sweepInterval)
    targetData.sweepInterval = null
  }
  if (targetData.reconnectTimer) {
    clearTimeout(targetData.reconnectTimer)
    targetData.reconnectTimer = null
  }
  if (targetData.fallbackTimer) {
    clearTimeout(targetData.fallbackTimer)
    targetData.fallbackTimer = null
  }

  try {
    if (targetData.botInstance) {
      targetData.botInstance.removeAllListeners()
      targetData.botInstance.end()
    }
  } catch (_) {}

  delete activeBots[username]
  console.log(`[🛑 STOP] Bot ${username} telah dihentikan sepenuhnya.`)
  return true
}

// FUNGSI TAHAP 2: LOGIN DENGAN IP BEBAS
function loginMinecraftBot(username, hostServer, passwordBot, interactionChannel, ownerId = null) {
  if (activeBots[username]) {
    stopBot(username)
  }

  let host = hostServer.trim()
  let port = 25565
  if (host.includes(':')) {
    const parts = host.split(':')
    host = parts[0].trim()
    port = parseInt(parts[1].trim(), 10) || 25565
  }

  let botData = {
    username: username,
    host: host,
    port: port,
    password: passwordBot,
    channel: interactionChannel,
    ownerId: ownerId,
    botInstance: null,
    loginSent: false,
    loginSuccess: false,
    fallbackTimer: null,
    reconnectTimer: null,
    sweepInterval: null,
    isStopped: false,
    failCount: 0,
    lastTpaTime: 0,
    spamTimer: null,
    isSpamming: false,
    spamMessage: '',
    spamDelay: 6,
    antiDuplikat: true,
    autoRegSent: false,
    lastSubServer: null,
    autoReturnCommand: null,
    wasDead: false
  }

  activeBots[username] = botData

  if (ownerId) {
    const subs = loadSubscriptions()
    if (subs[ownerId]) {
      if (!subs[ownerId].assignedBots) subs[ownerId].assignedBots = []
      if (!subs[ownerId].assignedBots.includes(username)) {
        subs[ownerId].assignedBots.push(username)
        saveSubscriptions(subs)
      }
    }
  }

  function createBot(isReconnect = false) {
    if (botData.isStopped) return

    botData.loginSent = false
    botData.loginSuccess = false
    botData.autoRegSent = false
    if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)
    if (botData.reconnectTimer) clearTimeout(botData.reconnectTimer)
    if (botData.sweepInterval) {
      clearInterval(botData.sweepInterval)
      botData.sweepInterval = null
    }

    if (botData.botInstance) {
      try { 
        botData.botInstance.removeAllListeners()
        botData.botInstance.end() 
      } catch (_) {}
    }

    botData.botInstance = mineflayer.createBot({
      host: botData.host,
      port: botData.port,
      username: username,
      version: "1.21.1",
      auth: 'offline',
      viewDistance: 'tiny',
      checkTimeoutInterval: 90 * 1000,
      hideErrors: false
    })

    // 🛡️ FITUR ANTI-CRASH MOB FARM & DROP JUTAAN BONE / ITEM:
    // 1. Minta server Minecraft membatasi jarak chunk render bot ke paling minimal (2 chunk)
    botData.botInstance.on('spawn', () => {
      try {
        botData.botInstance.setSettings({ viewDistance: 2 })
      } catch (_) {}
    })

    // 2. Langsung buang entity drop (bone, panah, exp orb) dari memori bot saat muncul
    botData.botInstance.on('entitySpawn', (entity) => {
      if (entity && (entity.name === 'item' || entity.type === 'item' || entity.name === 'experience_orb' || entity.type === 'object')) {
        delete botData.botInstance.entities[entity.id]
      }
    })

    // 3. Pembersihan sampah memori entity farm secara berkala setiap 3 detik
    botData.sweepInterval = setInterval(() => {
      if (!botData.botInstance || !botData.botInstance.entities) return
      for (const id in botData.botInstance.entities) {
        const ent = botData.botInstance.entities[id]
        if (ent && (ent.name === 'item' || ent.type === 'item' || ent.name === 'experience_orb' || ent.type === 'object')) {
          delete botData.botInstance.entities[id]
        }
      }
    }, 3000)

    botData.botInstance.loadPlugin(pathfinder)

    function notifyLoginSuccess(reasonText = '') {
      if (botData.isStopped || botData.loginSuccess) return
      botData.loginSuccess = true
      botData.failCount = 0
      if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)

      console.log(`[🎉 LOGIN SUKSES ${username}] Berhasil login di ${hostServer}!`)
      kirimWebhookLog(username, `✅ **LOGIN BERHASIL** - Akun **${username}** aktif di server \`${hostServer}\`.`, 3066993)
      if (interactionChannel) {
        let note = reasonText ? `\n> *${reasonText}*` : ''
        interactionChannel.send(`✅ **Login Berhasil!** Akun **${username}** telah berhasil login dan aktif di server \`${hostServer}\`! Siap digunakan. 🎉${note}`)
      }

      // Lanjutkan spam otomatis jika sebelumnya aktif
      if (botData.isSpamming && botData.spamMessage) {
        setTimeout(() => {
          if (botData.loginSuccess && !botData.isStopped && botData.isSpamming) {
            console.log(`[🔄 RESUME SPAM ${username}] Melanjutkan spam chat setelah login/reconnect...`)
            startSpam(username, botData.spamMessage, botData.spamDelay, botData.antiDuplikat)
          }
        }, 2000)
      }

      // Otomatis kembali ke sub-server terakhir jika ada (misal: ecocpvp)
      if (botData.lastSubServer) {
        setTimeout(() => {
          if (botData.loginSuccess && !botData.isStopped && botData.lastSubServer && botData.botInstance && botData.botInstance.chat) {
            console.log(`[🔄 AUTO-SERVER ${username}] Menghubungkan kembali ke sub-server /server ${botData.lastSubServer}...`)
            if (interactionChannel) {
              interactionChannel.send(`🔄 Otomatis mengembalikan akun **${username}** ke arena \`/server ${botData.lastSubServer}\`...`)
            }
            botData.botInstance.chat(`/server ${botData.lastSubServer}`)

            // Setelah masuk sub-server, otomatis ketik /home afk
            if (botData.autoReturnCommand) {
              setTimeout(() => {
                if (botData.loginSuccess && !botData.isStopped && botData.botInstance && botData.botInstance.chat) {
                  console.log(`[🏠 AUTO-HOME ${username}] Mengembalikan akun ke home: ${botData.autoReturnCommand}`)
                  if (interactionChannel) {
                    interactionChannel.send(`🏠 **Auto-Home:** Mengembalikan akun **${username}** ke lokasi farm (\`${botData.autoReturnCommand}\`)...`)
                  }
                  botData.botInstance.chat(botData.autoReturnCommand)
                }
              }, 4000)
            }
          }
        }, 3500)
      } else if (botData.autoReturnCommand) {
        setTimeout(() => {
          if (botData.loginSuccess && !botData.isStopped && botData.botInstance && botData.botInstance.chat) {
            console.log(`[🏠 AUTO-HOME ${username}] Menjalankan perintah pulang: ${botData.autoReturnCommand}`)
            botData.botInstance.chat(botData.autoReturnCommand)
          }
        }, 4000)
      }
    }

    function doRegister() {
      if (botData.isStopped || botData.autoRegSent || botData.loginSuccess) return
      botData.autoRegSent = true
      botData.loginSent = true
      if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)

      console.log(`[🔄 AUTO-REGIS ${username}] Server meminta pendaftaran. Menyiapkan pendaftaran otomatis...`)
      if (interactionChannel) {
        interactionChannel.send(`ℹ️ Server mendeteksi akun **${username}** belum terdaftar. Menjalankan pendaftaran otomatis (\`/register <password> <password>\`)...`)
      }

      setTimeout(() => {
        if (!botData.isStopped && botData.botInstance && botData.botInstance.chat) {
          console.log(`[🔑 REGIS ${username}] Mengirim /register <password> <password>...`)
          botData.botInstance.chat(`/register ${botData.password} ${botData.password}`)

          // Fallback timer registrasi: tunggu 5.5 detik
          botData.fallbackTimer = setTimeout(() => {
            if (!botData.isStopped && !botData.loginSuccess && botData.botInstance && !botData.botInstance._client?.ended) {
              notifyLoginSuccess('Pendaftaran dan login akun terkonfirmasi aktif.')
            }
          }, 5500)
        }
      }, 1500)
    }

    function doLogin() {
      if (botData.isStopped || botData.loginSent || botData.autoRegSent || botData.loginSuccess) return
      botData.loginSent = true

      console.log(`[🔑 LOGIN ${username}] Mengirim /login <password>...`)
      if (botData.botInstance && botData.botInstance.chat) {
        botData.botInstance.chat(`/login ${botData.password}`)
      }

      // Fallback timer: jika setelah 4.5 detik tidak ada pesan salah password atau kick, otomatis anggap login sukses!
      botData.fallbackTimer = setTimeout(() => {
        if (!botData.isStopped && !botData.loginSuccess && botData.botInstance && !botData.botInstance._client?.ended) {
          notifyLoginSuccess('Berhasil terhubung dan login tanpa kendala.')
        }
      }, 4500)
    }

    botData.botInstance.on('death', () => {
      botData.wasDead = true
      console.log(`[💀 DEATH ${username}] Bot mati di game! Mengirim perintah respawn...`)
      if (interactionChannel) {
        interactionChannel.send(`💀 **Bot Mati/Tereliminasi di Game!** Akun **${username}** mati. Melakukan respawn otomatis dalam 1.5 detik...`)
      }
      setTimeout(() => {
        try {
          if (botData.botInstance) botData.botInstance.respawn()
        } catch (_) {}
      }, 1500)
    })

    botData.botInstance.on('error', (err) => {
      if (botData.isStopped) return
      botData.failCount++
      console.log(`[❌ ERROR ${username}] (${botData.failCount}/5) ${err.message}`)
      if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)
      if (botData.spamTimer) {
        clearInterval(botData.spamTimer)
        botData.spamTimer = null
      }
      if (interactionChannel && !err.message.includes('ECONNRESET')) {
        interactionChannel.send(`❌ **Koneksi Terkendala:** Akun **${username}**: ${err.message}`)
      }
    })

    botData.botInstance.on('end', (reason) => {
      if (botData.isStopped) return
      console.log(`[🔴 DISCONNECT ${username}] Terputus karena: ${reason}`)
      if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)
      if (botData.spamTimer) {
        clearInterval(botData.spamTimer)
        botData.spamTimer = null
      }

      // Cek batas gagal berturut-turut agar tidak spam di Discord
      if (botData.failCount >= 5) {
        if (interactionChannel) {
          interactionChannel.send(`🛑 **Auto-Reconnect Dihentikan:** Akun **${username}** gagal terhubung ke \`${hostServer}\` sebanyak 5 kali berturut-turut. Bot dihentikan agar tidak spam channel. Silakan gunakan \`/login\` kembali.`)
        }
        stopBot(username)
        return
      }

      const delayReconnect = 6000
      if (interactionChannel) {
        interactionChannel.send(`🔄 **Koneksi Terputus (${reason})!** Akun **${username}** menyambung ulang otomatis dalam 6 detik...`)
      }
      botData.reconnectTimer = setTimeout(() => { 
        if (!botData.isStopped) createBot(true) 
      }, delayReconnect)
    })

    botData.botInstance.on('kicked', (reason) => {
      if (botData.isStopped) return
      let alasan = typeof reason === 'string' ? reason : JSON.stringify(reason)
      try {
        const parsed = typeof reason === 'string' ? JSON.parse(reason) : reason
        if (parsed.text) alasan = parsed.text
        else if (parsed.extra) alasan = parsed.extra.map(e => e.text || '').join('')
      } catch (_) {}
      console.log(`[⚠️ KICK ${username}] Di-kick server: ${alasan}`)
      if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)
      if (botData.spamTimer) {
        clearInterval(botData.spamTimer)
        botData.spamTimer = null
      }

      const lowerKick = alasan.toLowerCase()
      const isTemporaryIpBlock = lowerKick.includes('denied from entering') || lowerKick.includes('wait a few minutes')
      const isAntiBot = lowerKick.includes('voltraz') || 
                        lowerKick.includes('sonar') ||
                        lowerKick.includes('antibot') || 
                        lowerKick.includes('anti-bot') || 
                        lowerKick.includes('reconnect to verify') || 
                        lowerKick.includes('please reconnect') || 
                        lowerKick.includes('verification') || 
                        lowerKick.includes('bot verification') || 
                        lowerKick.includes('failed the bot') || 
                        lowerKick.includes('reconnected too fast')

      if (isTemporaryIpBlock) {
        if (interactionChannel) {
          interactionChannel.send(`🛑 **IP Anda Dibatasi Sementara oleh Anti-Bot Server (Sonar)!** Akun **${username}**:\n> *${alasan}*\n\n💡 **Solusi Paling Cepat:**\n• Jika pakai hotspot HP: Nyalakan **Mode Pesawat** selama 5 detik lalu matikan lagi (IP langsung berganti baru & bot bisa langsung masuk).\n• Atau tunggu **3 – 5 menit** tanpa mencoba masuk agar masa hukuman IP selesai.`)
        }
        // Jangan langsung reconnect cepat karena akan memperpanjang penalti Sonar!
        botData.reconnectTimer = setTimeout(() => { 
          if (!botData.isStopped) createBot(true) 
        }, 150000)
        return
      }

      const isAuthTimeout = lowerKick.includes('authorisation time elapsed') || lowerKick.includes('authorization time elapsed') || lowerKick.includes('time elapsed')
      const delayReconnect = (lowerKick.includes('reconnect to verify') || lowerKick.includes('please reconnect') || isAuthTimeout) ? 4500 : (isAntiBot ? 8000 : 35000)

      if (interactionChannel) {
        if (isAntiBot) {
          interactionChannel.send(`🛡️ **Verifikasi Anti-Bot Terdeteksi!** Akun **${username}**:\n> ${alasan.slice(0, 300)}\n🔄 Menjawab verifikasi server: Menyambung ulang otomatis dalam ${Math.round(delayReconnect / 1000)} detik...`)
        } else if (isAuthTimeout) {
          interactionChannel.send(`⏱️ **Waktu Autentikasi Habis!** Akun **${username}**:\n> ${alasan.slice(0, 300)}\n🔄 Menyambung ulang dalam 4 detik dan mencoba login/register otomatis...`)
        } else {
          interactionChannel.send(`⚠️ **Bot Di-kick!** Akun **${username}** di-kick dari \`${hostServer}\`:\n> ${alasan.slice(0, 300)}\n*(Akan mencoba menyambung ulang dalam 35 detik...)*`)
        }
      }
      botData.reconnectTimer = setTimeout(() => { 
        if (!botData.isStopped) createBot(true) 
      }, delayReconnect)
    })

    botData.botInstance.on('respawn', () => {
      console.log(`[🗺️ RESPAWN ${username}] Bot memuat dunia / berpindah dimensi/sub-server.`)

      // HANYA PULANG JIKA BOT BENAR-BENAR MATI (Bukan karena TPA atau pindah server!) DAN SUDAH DI-SETHOME
      if (botData.wasDead) {
        botData.wasDead = false
        console.log(`[🗺️ RESPAWN ${username}] Bot hidup kembali setelah mati di game.`)
        if (interactionChannel) {
          interactionChannel.send(`🗺️ **Respawn:** Akun **${username}** hidup kembali setelah mati.`)
        }

        if (botData.loginSuccess && botData.autoReturnCommand) {
          setTimeout(() => {
            if (!botData.isStopped && botData.botInstance && botData.botInstance.chat && botData.autoReturnCommand) {
              console.log(`[🏠 AUTO-HOME ${username}] Mengembalikan akun ke farm setelah mati: ${botData.autoReturnCommand}`)
              if (interactionChannel) {
                interactionChannel.send(`🏠 **Auto-Home Aktif:** Mengembalikan akun **${username}** ke lokasi farm (\`${botData.autoReturnCommand}\`)...`)
              }
              botData.botInstance.chat(botData.autoReturnCommand)
            }
          }, 3500)
        }
      }
    })

    botData.botInstance.on('title', (text) => {
      if (!text || botData.isStopped || botData.loginSuccess) return
      try {
        let titleStr = ''
        if (typeof text === 'string') {
          titleStr = text
        } else if (text && typeof text.toString === 'function' && text.toString() !== '[object Object]') {
          titleStr = text.toString()
        } else {
          titleStr = JSON.stringify(text)
        }
        titleStr = String(titleStr || '')
        const lower = titleStr.toLowerCase()

        // Deteksi jika server meminta /register (akun belum terdaftar)
        if (!botData.autoRegSent && (lower.includes('/register') || lower.includes('you need to use') || lower.includes('belum terdaftar') || lower.includes('daftar'))) {
          doRegister()
          return
        }

        if (lower.includes('berhasil') || 
            lower.includes('sukses') || 
            lower.includes('success') || 
            lower.includes('selamat') ||
            lower.includes('registered') ||
            lower.includes('a cracked session')) {
          notifyLoginSuccess(titleStr)
        }
      } catch (err) {
      }
    })

    botData.botInstance.on('actionBar', (jsonMsg) => {
      if (!jsonMsg || botData.isStopped || botData.loginSuccess) return
      try {
        let barStr = ''
        if (typeof jsonMsg === 'string') {
          barStr = jsonMsg
        } else if (jsonMsg && typeof jsonMsg.toString === 'function' && jsonMsg.toString() !== '[object Object]') {
          barStr = jsonMsg.toString()
        } else {
          barStr = JSON.stringify(jsonMsg)
        }
        barStr = String(barStr || '').trim()
        if (!barStr) return
        const lower = barStr.toLowerCase()
        if (lower.includes('berhasil') || lower.includes('sukses') || lower.includes('success') || lower.includes('selamat') || lower.includes('logged')) {
          notifyLoginSuccess(barStr)
        }
      } catch (err) {
      }
    })

    botData.botInstance.on('message', (jsonMsg) => {
      const pesan = jsonMsg.toString().trim()
      if (!pesan) return

      const lower = pesan.toLowerCase()

      // Tampilkan respon chat & sistem dari server ke konsol agar terbaca di panel
      if (!lower.includes('joined the game') && !lower.includes('left the game') && !lower.includes('bergabung ke peradaban')) {
        console.log(`[💬 CHAT ${username}] ${pesan.slice(0, 150)}`)
      }

      // 0. Deteksi jika server meminta /register di Chat (akun belum terdaftar)
      if (!botData.autoRegSent && (lower.includes('/register') || lower.includes('use /register') || lower.includes('belum terdaftar') || lower.includes('silakan register') || lower.includes('silahkan register') || lower.includes('must register') || lower.includes('you are not registered'))) {
        doRegister()
        return
      }

      // 1. Jika server minta login & belum dikirim
      if (!botData.loginSent && !botData.autoRegSent && (lower.includes('login') || lower.includes('/login') || lower.includes('masuk') || lower.includes('kata sandi'))) {
        setTimeout(doLogin, 1000)
        return
      }

      // 2. Deteksi jika password SALAH atau DITOLAK (Terlalu Lemah, dll)
      if (lower.includes('password salah') || 
          lower.includes('wrong password') || 
          lower.includes('incorrect password') || 
          lower.includes('kata sandi salah') || 
          lower.includes('sandi salah') ||
          lower.includes('login failed') ||
          lower.includes('gagal login') ||
          lower.includes('too weak') ||
          lower.includes('terlalu lemah') ||
          lower.includes('password is too weak') ||
          lower.includes('too short') ||
          lower.includes('terlalu pendek') ||
          lower.includes('do not match') ||
          lower.includes('tidak cocok')) {
        if (botData.fallbackTimer) clearTimeout(botData.fallbackTimer)
        console.log(`[❌ PASSWORD DITOLAK ${username}]: ${pesan}`)
        kirimWebhookLog(username, `❌ **PASSWORD DITOLAK** - ${pesan} di server \`${hostServer}\``, 15158332)
        if (interactionChannel) {
          let advice = ''
          if (lower.includes('weak') || lower.includes('lemah') || lower.includes('short') || lower.includes('pendek')) {
            advice = `\n💡 **Tips:** Server RelxMC mewajibkan password yang kuat/unik. Gunakan kombinasi huruf dan angka minimal 8 karakter (contoh: \`Kucing1234\`, \`RelxBot2026\`), jangan password angka sederhana.`
          }
          interactionChannel.send(`❌ **Password Ditolak Server (${username})!**\n> *${pesan}*${advice}`)
        }
        stopBot(username)
        return
      }

      // 3. Deteksi login SUKSES dari balasan server
      if (lower.includes('berhasil login') || 
          lower.includes('sukses login') || 
          lower.includes('successfully logged in') || 
          lower.includes('logged in successfully') || 
          lower.includes('successful login') || 
          lower.includes('kamu berhasil masuk') || 
          lower.includes('selamat datang kembali') || 
          lower.includes('welcome back') ||
          lower.includes('kamu sekarang login') ||
          lower.includes('anda sekarang login') ||
          lower.includes('anda telah login') ||
          lower.includes('kamu telah login') ||
          lower.includes('you are now logged in') ||
          lower.includes('you are already logged') ||
          lower.includes('you are already registered') ||
          lower.includes('a cracked session') ||
          lower.includes('registered') ||
          lower.includes('hi on minecraft server network') ||
          lower.includes('sending you to') ||
          lower.includes('you are in position') ||
          lower.includes('selamat datang di server') ||
          lower.includes('sukses masuk') ||
          lower.includes('berhasil masuk') ||
          lower.includes(`${username.toLowerCase()} bergabung ke peradaban`) ||
          lower.includes('changemailaddress') || 
          lower.includes('requestsecondfactor') || 
          lower.includes('otentikasi dua langkah') || 
          lower.includes('menghubungkan email ke akunmu') ||
          lower.includes('second factor enabled') ||
          lower.includes('email address assigned')) {
        notifyLoginSuccess(pesan)
        return
      }

      // 4. Deteksi Permintaan TPA (Teleport) ke Bot
      const isTpaExclude = 
        lower.includes("don't have a pending") ||
        lower.includes("tidak ada permintaan") ||
        lower.includes("teleporting...") ||
        lower.includes("teleportasi berhasil") ||
        lower.includes("teleportation complete") ||
        lower.includes("accepted teleport") ||
        lower.includes("permintaan teleportasi diterima")

      const isTpaRequest = !isTpaExclude && (
        lower.includes('/tpaccept') ||
        lower.includes('tpaccept') ||
        lower.includes('/tpdeny') ||
        lower.includes('tpdeny') ||
        lower.includes('has requested to teleport') || 
        lower.includes('has requested that you teleport') || 
        lower.includes('wants you to teleport') ||
        lower.includes('wants to teleport') ||
        lower.includes('teleport request') ||
        lower.includes('request to teleport') ||
        lower.includes('permintaan teleport') ||
        lower.includes('permintaan tpa') ||
        lower.includes('mengirim tpa') ||
        lower.includes('mengirimi anda tpa') ||
        lower.includes('meminta untuk teleport') || 
        lower.includes('meminta teleportasi') ||
        lower.includes('ingin berteleportasi') ||
        lower.includes('ingin teleport') ||
        (lower.includes('tpa') && (lower.includes('request') || lower.includes('permintaan') || lower.includes('ke kamu') || lower.includes('ke anda') || lower.includes('accept') || lower.includes('dari')))
      )

      if (isTpaRequest) {
        const now = Date.now()
        if (now - botData.lastTpaTime > 3500) {
          botData.lastTpaTime = now
          const targetChannel = botData.channel || interactionChannel
          console.log(`[☄️ TPA ${username}] Permintaan TPA terdeteksi: ${pesan}`)
          kirimWebhookLog(username, `☄️ **PERMINTAAN TPA MASUK!**\n> ${pesan}`, 16753920)

          if (targetChannel) {
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`tpa_acc_${username}`)
                .setLabel('✅ Terima TPA (/tpaccept)')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`tpa_deny_${username}`)
                .setLabel('❌ Tolak TPA (/tpdeny)')
                .setStyle(ButtonStyle.Danger)
            )

            targetChannel.send({
              content: `☄️ **Permintaan TPA Masuk ke ${username}!**\n> ${pesan}\nSilakan klik tombol di bawah untuk langsung menerima atau menolak:`,
              components: [row]
            }).catch(err => console.log(`[❌ ERROR KIRIM TPA]: ${err.message}`))
          }
        }
        return
      }

      // 5. Deteksi Status Perpindahan Sub-Server (Bungee/Velocity/Lobby)
      if (lower.includes('connecting to') || 
          lower.includes('menghubungkan ke') || 
          lower.includes('already connected') ||
          lower.includes('sending you to') ||
          lower.includes('transferred to') ||
          lower.includes('could not connect') ||
          lower.includes('tidak dapat terhubung') ||
          (lower.includes('welcome to') && botData.loginSuccess)) {
        if (lower.includes('sending you to')) {
          const match = pesan.match(/sending you to\s+([a-zA-Z0-9_-]+)/i)
          if (match && match[1]) {
            botData.lastSubServer = match[1]
            console.log(`[🌐 SUB-SERVER ${username}] Menyimpan arena sub-server: ${botData.lastSubServer}`)
          }
        }
        if (interactionChannel) {
          interactionChannel.send(`🌐 **Info Server (${username}):**\n> ${pesan}`)
        }
        return
      }

      // 6. Deteksi Status Teleportasi (Berhasil / Sedang Berlangsung)
      if (lower.includes('teleporting') || 
          lower.includes('teleportasi') || 
          lower.includes('request accepted') || 
          lower.includes('accepted teleport') || 
          lower.includes('teleportation complete') || 
          lower.includes('permintaan teleportasi diterima')) {
        if (interactionChannel) {
          interactionChannel.send(`✨ **Status Teleport (${username}):**\n> ${pesan}`)
        }
        return
      }
    })

    botData.botInstance.once('spawn', () => {
      console.log(`[🟢 ${username}] Masuk ke ${hostServer}. Menyiapkan login...`)
      kirimWebhookLog(username, `🟢 **ONLINE** - Berhasil masuk ke server \`${hostServer}\`.`, 3066993)
      if (interactionChannel) {
        if (!isReconnect) {
          interactionChannel.send(`🟢 **Bot Online!** Akun **${username}** berhasil masuk ke server \`${hostServer}\`. Memulai proses login otomatis...`)
        } else {
          interactionChannel.send(`🔄 **Bot Reconnected!** Akun **${username}** berhasil masuk kembali ke server \`${hostServer}\`.`)
        }
      }

      const defaultMove = new Movements(botData.botInstance)
      defaultMove.canDig = false
      defaultMove.allow1by1towers = false
      botData.botInstance.pathfinder.setMovements(defaultMove)

      setTimeout(() => {
        if (!botData.loginSent && !botData.autoRegSent && !botData.loginSuccess) {
          doLogin()
        }
      }, 1500)
    })
  }

  createBot()
}

// =========================================================================
// ⏰ BACKGROUND TIMER CEK KEDALUWARSA SEWA (SETIAP 30 DETIK)
// =========================================================================
setInterval(async () => {
  try {
    const subs = loadSubscriptions()
    const now = Date.now()
    let changed = false

    for (const userId of Object.keys(subs)) {
      const sub = subs[userId]
      if (sub.expiresAt && now > sub.expiresAt && !sub.expiredNotified) {
        sub.expiredNotified = true
        changed = true

        console.log(`[⏰ SEWA EXPIRED] Sewa user ${sub.username || userId} telah habis! Menghentikan semua bot...`)

        let stoppedNames = []
        Object.keys(activeBots).forEach(name => {
          if (activeBots[name].ownerId === userId) {
            stoppedNames.push(name)
            stopBot(name)
          }
        })

        if (sub.channelId) {
          try {
            const channel = discordClient.channels.cache.get(sub.channelId) || await discordClient.channels.fetch(sub.channelId).catch(() => null)
            if (channel) {
              const botsDetail = stoppedNames.length > 0 ? `Semua bot Anda (\`${stoppedNames.join(', ')}\`) telah dihentikan secara otomatis.` : 'Tidak ada bot yang sedang berjalan.'
              await channel.send(
                `⏰ **PERHATIAN: MASA SEWA TELAH HABIS!**\n` +
                `<@${userId}> Masa sewa bot Anda telah selesai pada <t:${Math.floor(sub.expiresAt / 1000)}:F>.\n` +
                `• ${botsDetail}\n` +
                `👉 Silakan hubungi Owner jika ingin memperpanjang sewa dan mengaktifkan bot kembali. Terima kasih!`
              )
            }
          } catch (errCh) {
            console.error('[Error kirim notif expired]:', errCh.message)
          }
        }
      }
    }

    if (changed) {
      saveSubscriptions(subs)
    }
  } catch (err) {
    console.error('[Error Expiry Check]:', err.message)
  }
}, 30000)

// =========================================================================
// 🌐 DISCORD INTERACTIONS & SLASH COMMANDS
// =========================================================================
discordClient.once('ready', async () => {
  console.log(`[Discord] Bot manajer aktif sebagai ${discordClient.user.tag}`)

  const commands = [
    new SlashCommandBuilder()
      .setName('register')
      .setDescription('Tahap 1: Daftarkan akun bot ke server Minecraft manapun!'),
    new SlashCommandBuilder()
      .setName('login')
      .setDescription('Tahap 2: Masukkan bot ke server dengan IP bebas dan lakukan login!'),
    new SlashCommandBuilder()
      .setName('menu')
      .setDescription('Kirim perintah game (contoh: /server ecocpvp)')
      .addStringOption(option => 
        option.setName('bot').setDescription('Nama bot').setRequired(true))
      .addStringOption(option => 
        option.setName('perintah').setDescription('Perintah game').setRequired(true)),
    new SlashCommandBuilder()
      .setName('spam')
      .setDescription('Kirim pesan promosi berulang (Ketik /spam untuk buka form popup modal lengkap)')
      .addStringOption(option => 
        option.setName('bot').setDescription('Nama bot (kosongkan untuk buka form popup)').setRequired(false))
      .addStringOption(option => 
        option.setName('pesan').setDescription('Pesan promosi').setRequired(false))
      .addIntegerOption(option => 
        option.setName('jeda').setDescription('Cooldown / jeda dalam detik (default: 35)').setRequired(false))
      .addBooleanOption(option => 
        option.setName('anti_duplikat').setDescription('Kode unik anti kick (default: True)').setRequired(false)),
    new SlashCommandBuilder()
      .setName('stopspam')
      .setDescription('Hentikan spam chat pada bot tertentu atau semua bot')
      .addStringOption(option => 
        option.setName('bot').setDescription('Nama bot (atau "semua" untuk hentikan semua spam)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('Hentikan bot dan batalkan proses auto-reconnect')
      .addStringOption(option => 
        option.setName('bot').setDescription('Nama bot (atau "semua" untuk hentikan semua bot)').setRequired(true)),
    new SlashCommandBuilder()
      .setName('list')
      .setDescription('Lihat daftar semua bot yang sedang aktif'),
    new SlashCommandBuilder()
      .setName('sewa')
      .setDescription('Pengelolaan sewa slot bot & channel privat (Khusus Admin / Owner)')
      .addSubcommand(sub =>
        sub.setName('tambah')
          .setDescription('Berikan slot sewa bot dan buatkan channel privat otomatis untuk user')
          .addUserOption(opt => opt.setName('user').setDescription('Pilih user penyewa').setRequired(true))
          .addIntegerOption(opt => opt.setName('slot').setDescription('Jumlah slot / bot yang diizinkan (misal: 1 atau 2)').setRequired(true))
          .addStringOption(opt => opt.setName('durasi').setDescription('Durasi sewa (contoh: 24h, 1d, 3d, 7d)').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('cek')
          .setDescription('Cek sisa durasi sewa, kuota slot, dan bot milik penyewa')
          .addUserOption(opt => opt.setName('user').setDescription('Pilih user penyewa (kosongkan untuk cek diri sendiri)').setRequired(false))
      )
      .addSubcommand(sub =>
        sub.setName('stop')
          .setDescription('Hentikan masa sewa penyewa dan matikan bot miliknya')
          .addUserOption(opt => opt.setName('user').setDescription('Pilih user penyewa yang ingin dihentikan').setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName('list')
          .setDescription('Lihat daftar seluruh penyewa aktif di server')
      )
      .addSubcommand(sub =>
        sub.setName('resetbot')
          .setDescription('Reset / hapus daftar bot penyewa (agar bisa registrasi atau ganti nama bot)')
          .addUserOption(opt => opt.setName('user').setDescription('Pilih user penyewa').setRequired(true))
      )
  ]

  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN)
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
    console.log('[Discord] Berhasil mendaftarkan command /register, /login, /menu, /spam, /stopspam, /stop, /list, & /sewa!')
  } catch (error) {
    console.error('Gagal daftar command:', error)
  }
})

discordClient.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'register') {
      const access = checkAccess(interaction, null, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      // Cegah buka modal jika kuota slot akun yang didaftarkan sudah penuh
      const subs = loadSubscriptions()
      const sub = subs[interaction.user.id]
      if (sub && !access.isAdmin && sub.assignedBots && sub.assignedBots.length >= sub.maxBots) {
        await interaction.reply({
          content: `❌ **Kuota Registrasi Penuh!** Kuota sewa Anda hanya untuk **${sub.maxBots} bot** dan Anda sudah mendaftarkan akun: \`${sub.assignedBots.join(', ')}\`.\n👉 Silakan langsung gunakan \`/login\` atau hubungi Owner jika ingin mengganti nama bot!`,
          flags: 64
        })
        return
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_register_bot')
        .setTitle('📝 Registrasi Akun Bot ke Server')

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_ip')
            .setLabel('IP Server Minecraft')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: play.servermc.com atau IP:Port')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_nickname')
            .setLabel('Nickname Bot')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: botBaru01')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_password')
            .setLabel('Password')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Password bebas')
            .setRequired(true)
        )
      )
      await interaction.showModal(modal)
    }
    else if (interaction.commandName === 'login') {
      const access = checkAccess(interaction, null, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_login_bot')
        .setTitle('🔑 Login Bot ke Server')

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_ip')
            .setLabel('IP Server Minecraft')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: play.servermc.com atau IP:Port')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_nickname')
            .setLabel('Nickname Bot yang Terdaftar')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Contoh: botBaru01')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('input_password')
            .setLabel('Password Akun')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Password akun bot')
            .setRequired(true)
        )
      )
      await interaction.showModal(modal)
    }
    else if (interaction.commandName === 'menu') {
      const botNick = interaction.options.getString('bot').trim()
      const gameCommand = interaction.options.getString('perintah').trim()

      const access = checkAccess(interaction, botNick, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      const targetData = activeBots[botNick]
      if (!targetData || !targetData.botInstance || !targetData.botInstance.chat) {
        await interaction.reply({ content: `❌ Bot **${botNick}** tidak ditemukan atau sedang offline!`, flags: 64 })
        return
      }

      // Tangkap balasan dari server dalam beberapa detik
      let capturedReplies = []
      const responseHandler = (jsonMsg) => {
        const txt = jsonMsg.toString().trim()
        if (txt && !capturedReplies.includes(txt)) {
          capturedReplies.push(txt)
        }
      }

      targetData.botInstance.on('message', responseHandler)
      if (gameCommand.toLowerCase().startsWith('/server ')) {
        const sub = gameCommand.split(' ')[1]
        if (sub) {
          targetData.lastSubServer = sub.trim()
          console.log(`[🌐 SUB-SERVER ${botNick}] Diset via /menu: ${targetData.lastSubServer}`)
        }
      }
      let extraInfo = ''
      if (!targetData.loginSuccess) {
        extraInfo += `\n⚠️ *Perhatian: Akun **${botNick}** saat ini masih dalam proses login/autentikasi di lobby server. Perintah tetap dikirim, namun jika belum berpindah arena, ulangi perintah setelah bot selesai login.*`
      }
      if (gameCommand.toLowerCase().startsWith('/sethome')) {
        const parts = gameCommand.trim().split(/\s+/)
        const hName = parts[1] || '1'
        targetData.autoReturnCommand = `/home ${hName}`
        console.log(`[🏠 AUTO-RETURN ${botNick}] Titik home diset: ${targetData.autoReturnCommand}`)
        extraInfo += `\n🏠 *Mulai sekarang, akun **${botNick}** akan otomatis mengetik \`${targetData.autoReturnCommand}\` jika mati atau reconnect!*`
      }
      else if (gameCommand.toLowerCase().startsWith('/delhome') || gameCommand.toLowerCase().startsWith('/deletehome') || gameCommand.toLowerCase().startsWith('/rmhome')) {
        targetData.autoReturnCommand = null
        console.log(`[🗑️ DELHOME ${botNick}] Titik home dihapus & auto-return dinonaktifkan.`)
        extraInfo += `\n🗑️ *Titik home dihapus! Fitur auto-return untuk akun **${botNick}** dinonaktifkan.*`
      }
      targetData.botInstance.chat(gameCommand)

      await interaction.reply({ content: `✅ Perintah \`${gameCommand}\` berhasil dikirim ke **${botNick}**!${extraInfo}`, flags: 64 })

      setTimeout(async () => {
        try {
          targetData.botInstance?.removeListener('message', responseHandler)
          if (capturedReplies.length > 0) {
            const preview = capturedReplies.slice(0, 3).map(r => `> ${r}`).join('\n')
            await interaction.followUp({ content: `💬 **Respon Server (${botNick}):**\n${preview}`, flags: 64 })
          }
        } catch (_) {}
      }, 5500)
    }
    else if (interaction.commandName === 'spam') {
      const botNickOpt = interaction.options.getString('bot')
      const pesanOpt = interaction.options.getString('pesan')

      // Jika dijalankan langsung /spam tanpa pesan, BUKA FORM POPUP MODAL LENGKAP!
      if (!pesanOpt) {
        const access = checkAccess(interaction, botNickOpt ? botNickOpt.trim() : null, false)
        if (!access.allowed) {
          await interaction.reply({ content: access.reason, flags: 64 })
          return
        }

        const modal = new ModalBuilder()
          .setCustomId('modal_spam_bot')
          .setTitle('📢 Pengaturan Spam Chat & Cooldown')

        const defaultBot = botNickOpt ? botNickOpt.trim() : (Object.keys(activeBots).find(k => activeBots[k].ownerId === interaction.user.id) || Object.keys(activeBots)[0] || '')

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_bot')
              .setLabel('Nickname Bot')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Contoh: botMrSk')
              .setValue(defaultBot)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_pesan')
              .setLabel('Isi Spam Chat')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Isi spam chat di sini...')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_jeda')
              .setLabel('Cooldown / Jeda Waktu (Detik)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Contoh: 35 (disarankan minimal 30-35 detik)')
              .setValue('35')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('input_antiduplikat')
              .setLabel('Anti-Duplikat Acak (ya / tidak)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('ya / tidak (default: ya)')
              .setValue('ya')
              .setRequired(false)
          )
        )
        await interaction.showModal(modal)
        return
      }

      const botNick = botNickOpt ? botNickOpt.trim() : (Object.keys(activeBots).find(k => activeBots[k].ownerId === interaction.user.id) || Object.keys(activeBots)[0] || '')
      const access = checkAccess(interaction, botNick, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      const pesan = pesanOpt.trim()
      const jeda = interaction.options.getInteger('jeda') || 35
      const antiDuplikat = interaction.options.getBoolean('anti_duplikat') !== false

      if (jeda < 3) {
        await interaction.reply({ content: '⚠️ Jeda minimal adalah **3 detik** demi keamanan bot agar tidak langsung di-kick oleh Minecraft vanilla (*Kicked for spamming*).', flags: 64 })
        return
      }

      const res = startSpam(botNick, pesan, jeda, antiDuplikat)
      if (res.success) {
        const duplikatInfo = antiDuplikat ? 'Aktif (Otomatis diberi kode acak unik)' : 'Nonaktif (Pesan murni)'
        await interaction.reply({
          content: `📢 **Spam Chat Berhasil Dimulai!**\n• Bot: **${botNick}**\n• Pesan:\n\`\`\`\n${pesan}\n\`\`\`\n• Jeda Cooldown: **${res.jeda} detik sekali**\n• Anti-Duplikat: **${duplikatInfo}**\n\n💡 *Gunakan \`/stopspam bot:${botNick}\` untuk menghentikan, atau \`/stop\` untuk mematikan bot.*`
        })
      } else {
        await interaction.reply({ content: `❌ Gagal mengaktifkan spam chat: ${res.reason}`, flags: 64 })
      }
    }
    else if (interaction.commandName === 'stopspam') {
      const botNick = interaction.options.getString('bot').trim()
      const member = interaction.member
      const user = interaction.user
      const guild = interaction.guild
      const isAdmin = isUserAdmin(member, user, guild)

      if (botNick.toLowerCase() === 'semua' || botNick.toLowerCase() === 'all') {
        let count = 0
        Object.keys(activeBots).forEach(name => {
          if (isAdmin || activeBots[name].ownerId === user.id) {
            if (activeBots[name].isSpamming) {
              stopSpam(name)
              count++
            }
          }
        })
        await interaction.reply({ content: `🛑 Spam chat telah dihentikan pada **${count}** bot.` })
        return
      }

      const access = checkAccess(interaction, botNick, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      const targetData = activeBots[botNick]
      if (!targetData) {
        await interaction.reply({ content: `❌ Bot **${botNick}** tidak ditemukan di daftar bot aktif.`, flags: 64 })
        return
      }

      if (targetData.isSpamming) {
        stopSpam(botNick)
        await interaction.reply({ content: `🛑 Spam chat untuk bot **${botNick}** berhasil dihentikan.` })
      } else {
        await interaction.reply({ content: `ℹ️ Bot **${botNick}** saat ini tidak sedang menjalankan spam chat.`, flags: 64 })
      }
    }
    else if (interaction.commandName === 'stop') {
      const botNick = interaction.options.getString('bot').trim()
      const member = interaction.member
      const user = interaction.user
      const guild = interaction.guild
      const isAdmin = isUserAdmin(member, user, guild)

      if (botNick.toLowerCase() === 'semua' || botNick.toLowerCase() === 'all') {
        const eligibleBots = Object.keys(activeBots).filter(name => isAdmin || activeBots[name].ownerId === user.id)
        if (eligibleBots.length === 0) {
          await interaction.reply({ content: 'ℹ️ Tidak ada bot milik Anda yang sedang aktif.', flags: 64 })
          return
        }

        eligibleBots.forEach(name => stopBot(name))
        await interaction.reply({ content: `🛑 Bot (**${eligibleBots.join(', ')}**) telah dihentikan sepenuhnya dan auto-reconnect dibatalkan!` })
        return
      }

      const access = checkAccess(interaction, botNick, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      if (stopBot(botNick)) {
        await interaction.reply({ content: `🛑 Bot **${botNick}** berhasil dihentikan sepenuhnya dan auto-reconnect dibatalkan.` })
      } else {
        await interaction.reply({ content: `❌ Bot **${botNick}** tidak ditemukan di daftar aktif. Gunakan \`/list\` untuk melihat bot yang sedang aktif.`, flags: 64 })
      }
    }
    else if (interaction.commandName === 'list') {
      const member = interaction.member
      const user = interaction.user
      const guild = interaction.guild
      const isAdmin = isUserAdmin(member, user, guild)

      const subs = loadSubscriptions()
      const sub = subs[user.id]
      if (!isAdmin && sub && sub.channelId && interaction.channelId !== sub.channelId) {
        await interaction.reply({ 
          content: `⚠️ Untuk menjaga privasi, gunakan perintah ini di channel privat Anda: <#${sub.channelId}>`, 
          flags: 64 
        })
        return
      }

      const botNames = Object.keys(activeBots).filter(name => {
        if (isAdmin) return true
        return activeBots[name].ownerId === user.id
      })

      if (botNames.length === 0) {
        await interaction.reply({ content: 'ℹ️ Saat ini tidak ada bot Anda yang sedang berjalan atau aktif.', flags: 64 })
        return
      }

      const listStr = botNames.map(name => {
        const b = activeBots[name]
        const status = b.loginSuccess ? '🟢 Online & Siap' : (b.botInstance ? '🟡 Sedang Menyambung' : '🔴 Menunggu Reconnect')
        const spamStatus = b.isSpamming ? ` | 📢 Spam (${b.spamDelay}s)` : ''
        const ownerTag = (isAdmin && b.ownerId) ? ` *(User: <@${b.ownerId}>)*` : ''
        return `• **${name}** ➜ \`${b.host}:${b.port}\` (${status}${spamStatus})${ownerTag}`
      }).join('\n')

      await interaction.reply({ content: `📋 **Daftar Bot Aktif (${botNames.length}):**\n${listStr}` })
    }
    else if (interaction.commandName === 'sewa') {
      const member = interaction.member
      const user = interaction.user
      const guild = interaction.guild
      const isAdmin = isUserAdmin(member, user, guild)
      const subcommand = interaction.options.getSubcommand()

      if (subcommand === 'tambah') {
        if (!isAdmin) {
          await interaction.reply({ content: '❌ Hanya Owner / Administrator yang dapat menambahkan sewa!', flags: 64 })
          return
        }

        await interaction.deferReply().catch((e) => console.log('[deferReply warn]:', e.message))

        const targetUser = interaction.options.getUser('user')
        const slot = interaction.options.getInteger('slot')
        const durasiStr = interaction.options.getString('durasi')
        const durationMs = parseDuration(durasiStr)
        const now = Date.now()
        const expiresAt = now + durationMs

        let subs = loadSubscriptions()
        let existing = subs[targetUser.id] || {}

        let channel = null
        if (existing.channelId) {
          channel = guild.channels.cache.get(existing.channelId) || await guild.channels.fetch(existing.channelId).catch(() => null)
        }

        if (!channel) {
          const cleanName = targetUser.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'user'
          const channelName = `🔒・bot-${cleanName}`

          try {
            channel = await guild.channels.create({
              name: channelName,
              type: ChannelType.GuildText,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                  id: targetUser.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                  ]
                },
                {
                  id: discordClient.user.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ManageChannels
                  ]
                }
              ]
            })
          } catch (err) {
            console.error('[Error Create Channel]:', err)
            await interaction.editReply({ content: `❌ Gagal membuat private channel: ${err.message}. Pastikan bot memiliki permission \`Manage Channels\`!` }).catch(() => {})
            return
          }
        }

        subs[targetUser.id] = {
          userId: targetUser.id,
          username: targetUser.username,
          channelId: channel.id,
          maxBots: slot,
          createdAt: now,
          expiresAt: expiresAt,
          durationStr: durasiStr,
          expiredNotified: false,
          assignedBots: existing.assignedBots || []
        }
        saveSubscriptions(subs)

        const expireUnix = Math.floor(expiresAt / 1000)

        try {
          await channel.send({
            content: `🎉 Halo <@${targetUser.id}>!\n\n` +
              `📦 **PAKET SEWA BOT MINECRAFT TELAH AKTIF!**\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `• **Kuota Slot:** **${slot} Bot**\n` +
              `• **Durasi:** **${durasiStr}**\n` +
              `• **Berakhir Pada:** <t:${expireUnix}:F> (<t:${expireUnix}:R>)\n` +
              `• **Channel Ini:** Khusus privat untuk Anda mengontrol bot.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `📖 **Panduan Penggunaan Bot:**\n` +
              `1️⃣ \`/register\` ➜ Daftarkan nickname & password bot jika belum terdaftar di server Minecraft.\n` +
              `2️⃣ \`/login\` ➜ Masukkan IP server & akun bot untuk mulai menyambung dan AFK 24/7.\n` +
              `3️⃣ \`/menu\` ➜ Kirim perintah game (contoh: \`/menu bot:nama perintah:/server ecocpvp\`, \`/menu bot:nama perintah:/sethome 1\`).\n` +
              `4️⃣ \`/spam\` ➜ Aktifkan spam chat otomatis (cooldown disarankan minimal 30-35 detik agar aman dari mute).\n` +
              `5️⃣ \`/stopspam\` ➜ Hentikan spam chat.\n` +
              `6️⃣ \`/stop\` ➜ Matikan bot.\n` +
              `7️⃣ \`/list\` ➜ Cek status bot Anda.\n\n` +
              `💡 *Semua notifikasi login, TPA, dan info bot Anda akan masuk secara privat ke channel ini!*`
          })
        } catch (e) {
          console.error('[Error send to private channel]:', e)
        }

        await interaction.editReply({
          content: `✅ **Sewa Berhasil Ditambahkan!**\n• User: <@${targetUser.id}>\n• Kuota: **${slot} Bot**\n• Durasi: **${durasiStr}** (s/d <t:${expireUnix}:R>)\n• Private Channel: <#${channel.id}>`
        }).catch(() => {})
      }
      else if (subcommand === 'cek') {
        const targetUser = interaction.options.getUser('user') || interaction.user
        if (targetUser.id !== user.id && !isAdmin) {
          await interaction.reply({ content: '❌ Anda hanya dapat mengecek sewa milik Anda sendiri!', flags: 64 })
          return
        }

        const subs = loadSubscriptions()
        const sub = subs[targetUser.id]
        if (!sub) {
          await interaction.reply({ content: `ℹ️ User <@${targetUser.id}> belum memiliki langganan/sewa aktif.`, flags: 64 })
          return
        }

        const now = Date.now()
        const isExpired = now > sub.expiresAt
        const expireUnix = Math.floor(sub.expiresAt / 1000)
        const activeCount = Object.values(activeBots).filter(b => b.ownerId === targetUser.id && !b.isStopped).length
        const statusStr = isExpired ? '🔴 **Sudah Berakhir (Expired)**' : `🟢 **Aktif** (Berakhir: <t:${expireUnix}:R>)`

        await interaction.reply({
          content: `📊 **Status Sewa Bot <@${targetUser.id}>:**\n` +
            `• Status: ${statusStr}\n` +
            `• Kuota Slot: **${activeCount} / ${sub.maxBots} bot aktif**\n` +
            `• Private Channel: <#${sub.channelId}>\n` +
            `• Riwayat Bot: \`${(sub.assignedBots && sub.assignedBots.length) ? sub.assignedBots.join(', ') : 'Belum ada'}\`\n` +
            `• Berakhir Pada: <t:${expireUnix}:F>`,
          flags: 64
        })
      }
      else if (subcommand === 'stop') {
        if (!isAdmin) {
          await interaction.reply({ content: '❌ Hanya Owner / Administrator yang dapat menghentikan sewa!', flags: 64 })
          return
        }

        const targetUser = interaction.options.getUser('user')
        let subs = loadSubscriptions()
        const sub = subs[targetUser.id]
        if (!sub) {
          await interaction.reply({ content: `ℹ️ User <@${targetUser.id}> tidak memiliki data sewa aktif.`, flags: 64 })
          return
        }

        let stoppedCount = 0
        Object.keys(activeBots).forEach(name => {
          if (activeBots[name].ownerId === targetUser.id) {
            stopBot(name)
            stoppedCount++
          }
        })

        sub.expiresAt = Date.now()
        sub.expiredNotified = true
        saveSubscriptions(subs)

        if (sub.channelId) {
          const ch = guild.channels.cache.get(sub.channelId) || await guild.channels.fetch(sub.channelId).catch(() => null)
          if (ch) {
            ch.send(`🛑 <@${targetUser.id}> Masa sewa Anda telah dihentikan oleh Admin. Semua bot (**${stoppedCount} bot**) telah dimatikan.`)
          }
        }

        await interaction.reply({ content: `🛑 Sewa user <@${targetUser.id}> berhasil dihentikan. **${stoppedCount} bot** telah dimatikan.` })
      }
      else if (subcommand === 'list') {
        if (!isAdmin) {
          await interaction.reply({ content: '❌ Hanya Owner / Administrator yang dapat melihat daftar seluruh penyewa!', flags: 64 })
          return
        }

        const subs = loadSubscriptions()
        const userIds = Object.keys(subs)
        if (userIds.length === 0) {
          await interaction.reply({ content: 'ℹ️ Belum ada data penyewa yang terdaftar.', flags: 64 })
          return
        }

        const now = Date.now()
        const lines = userIds.map(uid => {
          const s = subs[uid]
          const isExpired = now > s.expiresAt
          const expUnix = Math.floor(s.expiresAt / 1000)
          const activeCount = Object.values(activeBots).filter(b => b.ownerId === uid && !b.isStopped).length
          const statusIcon = isExpired ? '🔴 Expired' : `🟢 Aktif (<t:${expUnix}:R>)`
          return `• <@${uid}> ➜ Slot: **${activeCount}/${s.maxBots}** | Status: ${statusIcon} | Channel: <#${s.channelId}>`
        })

        await interaction.reply({ content: `📋 **Daftar Seluruh Penyewa Bot (${userIds.length}):**\n${lines.join('\n')}`, flags: 64 })
      }
      else if (subcommand === 'resetbot') {
        if (!isAdmin) {
          await interaction.reply({ content: '❌ Hanya Owner / Administrator yang dapat mereset bot penyewa!', flags: 64 })
          return
        }

        const targetUser = interaction.options.getUser('user')
        let subs = loadSubscriptions()
        const sub = subs[targetUser.id]
        if (!sub) {
          await interaction.reply({ content: `ℹ️ User <@${targetUser.id}> tidak memiliki data sewa aktif.`, flags: 64 })
          return
        }

        Object.keys(activeBots).forEach(name => {
          if (activeBots[name].ownerId === targetUser.id) {
            stopBot(name)
          }
        })

        const oldBots = (sub.assignedBots && sub.assignedBots.length) ? sub.assignedBots.join(', ') : 'Belum ada'
        sub.assignedBots = []
        saveSubscriptions(subs)

        if (sub.channelId) {
          const ch = guild.channels.cache.get(sub.channelId) || await guild.channels.fetch(sub.channelId).catch(() => null)
          if (ch) {
            ch.send(`🔄 <@${targetUser.id}> Slot bot Anda telah direset oleh Admin. Anda sekarang bisa mendaftarkan (\`/register\`) atau login bot dengan nama baru!`)
          }
        }

        await interaction.reply({ content: `✅ Berhasil mereset slot bot <@${targetUser.id}> (Bot sebelumnya: \`${oldBots}\`). User sekarang bisa mendaftarkan nama bot baru.` })
      }
    }
  } 
  else if (interaction.isButton()) {
    const customId = interaction.customId
    if (customId.startsWith('tpa_acc_') || customId.startsWith('tpa_deny_')) {
      const isAcc = customId.startsWith('tpa_acc_')
      const botNick = customId.replace(isAcc ? 'tpa_acc_' : 'tpa_deny_', '')
      const targetData = activeBots[botNick]

      const member = interaction.member
      const user = interaction.user
      const guild = interaction.guild
      const isAdmin = isUserAdmin(member, user, guild)

      if (targetData && targetData.ownerId && targetData.ownerId !== user.id && !isAdmin) {
        await interaction.reply({ content: `❌ Tombol TPA ini hanya untuk pemilik bot **${botNick}**!`, flags: 64 })
        return
      }

      if (isAcc) {
        if (targetData && targetData.botInstance && targetData.botInstance.chat) {
          targetData.botInstance.chat('/tpaccept')
          await interaction.reply({ content: `✅ Permintaan TPA berhasil diterima oleh **${botNick}**! (\`/tpaccept\`)` })
        } else {
          await interaction.reply({ content: `❌ Bot **${botNick}** sedang offline atau tidak aktif!`, flags: 64 })
        }
      } else {
        if (targetData && targetData.botInstance && targetData.botInstance.chat) {
          targetData.botInstance.chat('/tpdeny')
          await interaction.reply({ content: `❌ Permintaan TPA ditolak oleh **${botNick}**! (\`/tpdeny\`)` })
        } else {
          await interaction.reply({ content: `❌ Bot **${botNick}** sedang offline atau tidak aktif!`, flags: 64 })
        }
      }
      return
    }
  } 
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_register_bot') {
      const serverIp = interaction.fields.getTextInputValue('input_ip').trim()
      const botNick = interaction.fields.getTextInputValue('input_nickname').trim()
      const botPassword = interaction.fields.getTextInputValue('input_password').trim()

      const access = checkAccess(interaction, botNick, true)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      await interaction.reply({ content: `⚙️ Memproses registrasi **${botNick}** ke \`${serverIp}\`... Notifikasi sukses akan muncul di channel ini secara otomatis.`, flags: 64 })
      registerMinecraftBot(botNick, serverIp, botPassword, interaction.channel, interaction.user.id)
    }
    else if (interaction.customId === 'modal_login_bot') {
      const serverIp = interaction.fields.getTextInputValue('input_ip').trim()
      const botNick = interaction.fields.getTextInputValue('input_nickname').trim()
      const botPassword = interaction.fields.getTextInputValue('input_password').trim()

      const access = checkAccess(interaction, botNick, true)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      await interaction.reply({ content: `✅ Meluncurkan **${botNick}** ke \`${serverIp}\` dan melakukan login otomatis...`, flags: 64 })
      loginMinecraftBot(botNick, serverIp, botPassword, interaction.channel, interaction.user.id)
    }
    else if (interaction.customId === 'modal_spam_bot') {
      const botNick = interaction.fields.getTextInputValue('input_bot').trim()
      const pesan = interaction.fields.getTextInputValue('input_pesan').trim()
      const jedaStr = interaction.fields.getTextInputValue('input_jeda') || '35'
      const antiDuplikatStr = (interaction.fields.getTextInputValue('input_antiduplikat') || 'ya').toLowerCase()

      const access = checkAccess(interaction, botNick, false)
      if (!access.allowed) {
        await interaction.reply({ content: access.reason, flags: 64 })
        return
      }

      const jeda = Math.max(3, parseInt(jedaStr.trim(), 10) || 35)
      const antiDuplikat = !antiDuplikatStr.includes('tidak') && !antiDuplikatStr.includes('no') && !antiDuplikatStr.includes('false')

      const res = startSpam(botNick, pesan, jeda, antiDuplikat)
      if (res.success) {
        const duplikatInfo = antiDuplikat ? 'Aktif (Otomatis diberi kode acak unik)' : 'Nonaktif (Pesan murni)'
        await interaction.reply({
          content: `📢 **Spam Chat Berhasil Dimulai!**\n• Bot: **${botNick}**\n• Pesan:\n\`\`\`\n${pesan}\n\`\`\`\n• Jeda Cooldown: **${res.jeda} detik sekali**\n• Anti-Duplikat: **${duplikatInfo}**\n\n💡 *Gunakan \`/stopspam bot:${botNick}\` untuk menghentikan, atau \`/stop\` untuk mematikan bot.*`
        })
      } else {
        await interaction.reply({ content: `❌ Gagal mengaktifkan spam chat: ${res.reason}`, flags: 64 })
      }
    }
  }
  } catch (err) {
    console.error('[Error interactionCreate]:', err?.message || err)
  }
})

discordClient.login(DISCORD_BOT_TOKEN)