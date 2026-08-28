const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./db');
const state = require('./state');

const APPROVAL_CHANNEL_ID = '1512604646328504370';

const DEFAULT_QUEST_POOL = [
  { id: 'q-spd-160', akt: 'Build', title: 'SPD 160+', description: 'Build Character Apapun dengan Stats Speed 160+', difficulty: 'Mudah', points: 10 },
  { id: 'q-spd-200', akt: 'Build', title: 'SPD 200+', description: 'Build Character Apapun dengan Stats Speed 200+', difficulty: 'Sedang', points: 10 },
  { id: 'q-spd-230', akt: 'Build', title: 'SPD 230+', description: 'Build Character Apapun dengan Stats Speed 230+', difficulty: 'Legendaris', points: 10 },
  { id: 'q-cdm-180', akt: 'Build', title: 'CDM 180%+', description: 'Build Character Apapun dengan Stats Crit Damage 180%+', difficulty: 'Mudah', points: 10 },
  { id: 'q-cdm-245', akt: 'Build', title: 'CDM 245%+', description: 'Build Character Apapun dengan Stats Crit Damage 245%+', difficulty: 'Sulit', points: 10 },
  { id: 'q-cdm-285', akt: 'Build', title: 'CDM 285%+', description: 'Build Character Apapun dengan Stats Crit Damage 285%+', difficulty: 'Legendaris', points: 10 },
  { id: 'q-du-redraw-20', akt: 'DU', title: 'Redraw: 20+', description: 'Dapatkan 20+ Redraw di Divergent Universe', difficulty: 'Mudah', points: 10 },
  { id: 'q-du-redraw-100', akt: 'DU', title: 'Redraw: 100+', description: 'Dapatkan 100+ Redraw di Divergent Universe', difficulty: 'Sedang', points: 10 },
  { id: 'q-du-redraw-1000', akt: 'DU', title: 'Redraw: 1000+', description: 'Dapatkan 1000+ Redraw di Divergent Universe', difficulty: 'Legendaris', points: 10 },
  { id: 'q-endgame-as', akt: 'Endgame', title: 'AS 3900+ Score', description: 'Dapatkan Score 3900+ Pada Endgame Apocalyptic Shadow', difficulty: 'Legendaris', points: 10 },
  { id: 'q-endgame-moc', akt: 'Endgame', title: 'MOC 0 Cycle', description: 'Selesaikan Endgame Memory of Chaos dengan 0 Cycle', difficulty: 'Legendaris', points: 10 },
  { id: 'q-endgame-pf', akt: 'Endgame', title: 'PF Perfect Score', description: 'Dapatkan Score 80000 Pada Endgame Pure Fiction', difficulty: 'Legendaris', points: 10 },
  { id: 'q-endgame-aa', akt: 'Endgame', title: 'AA Completed', description: 'Selesaikan Endgame Anomaly Arbitation dalam 6 Cycles atau kurang', difficulty: 'Legendaris', points: 10 },
  { id: 'q-du-fragment', akt: 'DU', title: 'Cosmic Fragment: 5.000', description: 'Dapatkan Cosmic Fragment Sebanyak 5000 di Divergent Universe', difficulty: 'Mudah', points: 10 },
  { id: 'q-cw-5000m', akt: 'CW', title: '5000M Damage Final', description: 'Capai 5000M Damage Saat Bermain Currency Wars', difficulty: 'Mudah', points: 10 },
  { id: 'q-cw-admin', akt: 'CW', title: 'Admin Mode Lv.999', description: 'Dapatkan 3 Star 5 Cost Silver Wolf Lv.999 di Currency Wars', difficulty: 'Sulit', points: 10 },
  { id: 'q-cw-beloved', akt: 'CW', title: 'Beloved One Bond', description: 'Dapatkan 3 Star 5 Cost Cyrene di Currency Wars', difficulty: 'Sulit', points: 10 },
  { id: 'q-cw-owlbert', akt: 'CW', title: 'Owlbert', description: 'Dapatkan Investment Strategi Owlbert', difficulty: 'Sulit', points: 10 }
];

function shuffleArray(arr) {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
}

function dealUserDeck(userId, forceRedraw = false) {
  const localDecks = db.loadLocalDecks();
  let pool = db.loadLocalQuests();
  if (!pool || pool.length === 0) {
    pool = DEFAULT_QUEST_POOL;
    db.saveLocalQuests(pool);
  }

  const existingDeck = localDecks[userId];

  if (existingDeck && existingDeck.dealt && existingDeck.cards && existingDeck.cards.length > 0 && !forceRedraw) {
    return existingDeck;
  }

  const shuffled = shuffleArray(pool);
  const dealtCards = shuffled.slice(0, 5);

  const statuses = existingDeck?.statuses || {};
  dealtCards.forEach(c => {
    if (!statuses[c.id]) {
      statuses[c.id] = 'Active';
    }
  });

  const newDeck = {
    uid: userId,
    dealt: true,
    cards: dealtCards,
    statuses: statuses,
    updatedAt: new Date().toISOString()
  };

  localDecks[userId] = newDeck;
  db.saveLocalDecks(localDecks);
  return newDeck;
}

function buildQuestDeckEmbed(userId, deck, displayName, avatarUrl) {
  const cards = deck.cards || [];
  const statuses = deck.statuses || {};

  const difficultyEmojis = {
    'Mudah': '🟢',
    'Sedang': '🟡',
    'Sulit': '🔴',
    'Legendaris': '👑'
  };

  let descriptionText = `Selamat datang di **Tirai Tantangan CrunchyVerse**! 🎪\nBerikut 5 kartu quest aktif di hand Anda:\n\n`;

  cards.forEach((card, index) => {
    const cardNum = index + 1;
    const status = statuses[card.id] || 'Active';
    let statusBadge = '🃏 **Aktif**';
    if (status === 'Completed' || status === 'approved') statusBadge = '✅ **Selesai**';
    else if (status === 'Pending' || status === 'pending') statusBadge = '⏳ **Diverifikasi Admin**';

    const diffEmoji = difficultyEmojis[card.difficulty] || '⭐';

    descriptionText += `**[ ${cardNum} ] ${card.title}** ${diffEmoji}\n`;
    descriptionText += `├ 📜 **Tugas:** ${card.description}\n`;
    descriptionText += `├ 🏷️ **Kategori:** \`${card.akt || 'Quest'}\` | 🎁 **Reward:** \`+${card.points || 10} CV$\`\n`;
    descriptionText += `└ 📊 **Status:** ${statusBadge}\n\n`;
  });

  descriptionText += `\n💡 **Cara Klaim Kartu Quest:**\n`;
  descriptionText += `Gunakan perintah: \`!claim <NomorKartu> <Bukti/Keterangan/LinkGambar>\`\n`;
  descriptionText += `*Contoh:* \`!claim 1 Stats Speed 165 https://imgur.com/xyz.png\`\n\n`;
  descriptionText += `🔄 **Bosan dengan Kartu?** Tekan tombol **Pocok Ulang / Redraw** di bawah!`;

  const embed = new EmbedBuilder()
    .setTitle(`🃏 Tirai Tantangan Teater — Deck Kartu ${displayName}`)
    .setDescription(descriptionText)
    .setColor('#D4AF37')
    .setThumbnail(avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=crunchy-quest')
    .setFooter({ text: 'CrunchyVerse Interactive Quest Deck System • discord.js v14' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`krpk_quest_redraw_${userId}`)
      .setLabel('🎴 Pocok Ulang / Redraw')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`krpk_quest_claim_info_${userId}`)
      .setLabel('📥 Cara Klaim Quest')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`krpk_quest_status_${userId}`)
      .setLabel('🏆 Progress Saya')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row] };
}

async function handleQuestCommand(message, commandName, args) {
  const userId = message.author.id;
  const username = message.author.username;
  const displayName = message.member?.displayName || message.author.username;
  const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

  if (commandName === 'deck' || commandName === 'quest' || commandName === 'cards' || commandName === 'tantangan') {
    const deck = dealUserDeck(userId, false);
    const { embed, components } = buildQuestDeckEmbed(userId, deck, displayName, avatarUrl);
    return message.reply({ embeds: [embed], components });
  }

  if (commandName === 'redraw' || commandName === 'pocok') {
    const deck = dealUserDeck(userId, true);
    const { embed, components } = buildQuestDeckEmbed(userId, deck, displayName, avatarUrl);
    return message.reply({
      content: `🎴 **Kartu deck berhasil dikocok ulang!** Berikut 5 kartu quest baru Anda:`,
      embeds: [embed],
      components
    });
  }

  if (commandName === 'claim' || commandName === 'submit') {
    const cardNum = parseInt(args[0], 10);
    if (isNaN(cardNum) || cardNum < 1 || cardNum > 5) {
      return message.reply('⚠️ **Format Salah!** Gunakan: `!claim <NomorKartu 1-5> <Bukti/Keterangan/LinkGambar>`\n*Contoh:* `!claim 1 Stats Speed 165 https://imgur.com/xyz.png`');
    }

    const deck = dealUserDeck(userId, false);
    const targetCard = deck.cards[cardNum - 1];

    if (!targetCard) {
      return message.reply('❌ **Kartu quest tidak ditemukan.** Silakan jalankan `!deck` terlebih dahulu.');
    }

    const currentStatus = deck.statuses[targetCard.id];
    if (currentStatus === 'Completed' || currentStatus === 'approved') {
      return message.reply(`✅ **Kartu #${cardNum} (${targetCard.title}) sudah selesai diklaim sebelumnya!**`);
    }
    if (currentStatus === 'Pending' || currentStatus === 'pending') {
      return message.reply(`⏳ **Kartu #${cardNum} (${targetCard.title}) saat ini sedang dalam proses verifikasi Admin!**`);
    }

    let proofText = args.slice(1).join(' ').trim();
    let imageUrl = null;

    if (message.attachments && message.attachments.size > 0) {
      const attachment = message.attachments.first();
      imageUrl = attachment.url;
    }

    if (!proofText && !imageUrl) {
      return message.reply('⚠️ **Harap sertakan bukti pengerjaan quest!** (Bisa berupa teks keterangan, link screenshot, atau lampirkan foto/gambar di pesan Discord ini).');
    }

    const submissionId = `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const submission = {
      id: submissionId,
      userId: userId,
      username: username,
      questId: targetCard.id,
      questTitle: targetCard.title,
      points: targetCard.points || 10,
      proof: proofText || 'Foto/Gambar terlampir',
      imageUrl: imageUrl,
      status: 'pending',
      createdAt: new Date().toISOString(),
      discordMessageId: null
    };

    // Update deck status
    deck.statuses[targetCard.id] = 'Pending';
    const localDecks = db.loadLocalDecks();
    localDecks[userId] = deck;
    db.saveLocalDecks(localDecks);

    // Save submission locally
    const subs = db.loadLocalSubmissions();
    subs.unshift(submission);
    db.saveLocalSubmissions(subs);

    // Send to admin approval channel
    try {
      const channel = await state.client.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
      if (channel && channel.isTextBased()) {
        const approvalEmbed = new EmbedBuilder()
          .setTitle('📥 Submission Quest Baru (Tirai Tantangan)')
          .setDescription(`User **${message.author}** (\`@${username}\`) mengajukan klaim untuk kartu quest!`)
          .addFields(
            { name: '🎴 Kartu Quest', value: `**${targetCard.title}** (\`${targetCard.id}\`)`, inline: true },
            { name: '🏷️ Kategori', value: `\`${targetCard.akt || 'Quest'}\``, inline: true },
            { name: '🎁 Reward Points', value: `\`+${targetCard.points || 10} CV$\``, inline: true },
            { name: '📝 Bukti Keterangan', value: proofText ? `\`\`\`\n${proofText.slice(0, 1000)}\n\`\`\`` : '*Tidak ada teks, foto terlampir*' }
          )
          .setColor('#3498db')
          .setThumbnail(avatarUrl)
          .setFooter({ text: `ID Submission: ${submissionId} • Berikan Reaksi ✅ (Setujui) atau ❌ (Tolak)` })
          .setTimestamp();

        if (imageUrl) {
          approvalEmbed.setImage(imageUrl);
        }

        const sentMsg = await channel.send({ embeds: [approvalEmbed] });
        await sentMsg.react('✅');
        await sentMsg.react('❌');

        // Update submission with message ID
        submission.discordMessageId = sentMsg.id;
        db.saveLocalSubmissions(subs);
        console.log(`📥 [QuestBot] Submission ${submissionId} dikirim ke channel approval #${sentMsg.id}`);
      }
    } catch (err) {
      console.error('❌ [QuestBot] Gagal kirim pesan approval:', err.message);
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('📥 Bukti Quest Berhasil Dikirim!')
          .setDescription(
            `Bukti pengerjaan untuk Kartu **#${cardNum}: ${targetCard.title}** telah dikirim ke Moderator/Admin teater untuk diverifikasi!\n\n` +
            `🎁 **Reward:** \`+${targetCard.points || 10} CV$\` akan otomatis ditambahkan setelah disetujui.`
          )
          .setColor('#57F287')
          .setTimestamp()
      ]
    });
  }

  if (commandName === 'myquests' || commandName === 'progress') {
    const localUsers = db.loadLocalUsers();
    const userData = localUsers[userId] || { cv: 0, points: 0 };
    const deck = dealUserDeck(userId, false);
    const statuses = deck.statuses || {};
    const completedCards = Object.values(statuses).filter(s => s === 'Completed' || s === 'approved').length;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Progress Tirai Tantangan — ${displayName}`)
      .setDescription(
        `📊 **Total Kartu Selesai:** \`${completedCards}\` Kartu\n` +
        `💰 **Total Kekayaan Teater (CV$):** \`${userData.cv || userData.points || 0} CV$\`\n\n` +
        `Jalankan \`!deck\` untuk melihat 5 kartu quest aktif Anda!`
      )
      .setColor('#9b59b6')
      .setThumbnail(avatarUrl)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  if (commandName === 'addquest') {
    const isServerAdmin = message.member?.permissions.has('Administrator');
    const hasModRole = message.member?.roles.cache.has('1403364896242139187');
    if (!isServerAdmin && !hasModRole) {
      return message.reply('🚫 Perintah ini hanya untuk Admin/Volunteer Theater.');
    }

    const questInput = args.join(' ');
    const parts = questInput.split('|').map(s => s.trim());

    if (parts.length < 3) {
      return message.reply('⚠️ **Format Salah!** Gunakan: `!addquest <Judul> | <Deskripsi> | <Poin> | <Kategori (Opsional)> | <Kesulitan (Opsional)>`\n*Contoh:* `!addquest SPD 250+ | Stats Speed 250+ | 15 | Build | Legendaris`');
    }

    const [title, description, pointsStr, akt, difficulty] = parts;
    const points = parseInt(pointsStr, 10) || 10;
    const newQuest = {
      id: `quest-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      akt: akt || 'Endgame',
      title,
      description,
      difficulty: difficulty || 'Legendaris',
      points
    };

    const quests = db.loadLocalQuests();
    quests.push(newQuest);
    db.saveLocalQuests(quests);

    return message.reply(`✅ **Kartu Quest Baru Berhasil Ditambahkan!**\n**Judul:** ${title}\n**Poin:** ${points} CV$\n**Kategori:** ${akt || 'Endgame'}`);
  }
}

async function handleQuestInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { customId, user, member } = interaction;

  if (customId.startsWith('krpk_quest_redraw_')) {
    const targetUserId = customId.replace('krpk_quest_redraw_', '');
    if (user.id !== targetUserId) {
      return interaction.reply({ content: '🚫 Ini adalah deck kartu milik user lain. Jalankan `!deck` untuk membuka deck Anda sendiri!', flags: 64 });
    }

    const displayName = member?.displayName || user.username;
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
    const deck = dealUserDeck(user.id, true);
    const { embed, components } = buildQuestDeckEmbed(user.id, deck, displayName, avatarUrl);

    return interaction.update({
      content: '🎴 **Kartu deck berhasil dikocok ulang!** Berikut 5 kartu quest baru Anda:',
      embeds: [embed],
      components
    });
  }

  if (customId.startsWith('krpk_quest_claim_info_')) {
    return interaction.reply({
      content:
        `💡 **Cara Klaim Kartu Quest:**\n\n` +
        `Ketik perintah berikut di channel ini:\n` +
        `\`!claim <NomorKartu 1-5> <Bukti/Keterangan/LinkGambar>\`\n\n` +
        `*Contoh Teks & Gambar:* \`!claim 1 Stats Speed 165 https://imgur.com/xyz.png\`\n` +
        `*Atau:* Ketik \`!claim 1 Stats Speed 165\` sambil melampirkan foto screenshot di pesan Discord!`,
      flags: 64
    });
  }

  if (customId.startsWith('krpk_quest_status_')) {
    const localUsers = db.loadLocalUsers();
    const userData = localUsers[user.id] || { cv: 0, points: 0 };
    const deck = dealUserDeck(user.id, false);
    const statuses = deck.statuses || {};
    const completedCards = Object.values(statuses).filter(s => s === 'Completed' || s === 'approved').length;

    return interaction.reply({
      content: `🏆 **Progress Quest ${user.username}:**\n├ 📊 Kartu Selesai: \`${completedCards}\` Kartu\n└ 💰 Total Kekayaan: \`${userData.cv || userData.points || 0} CV$\``,
      flags: 64
    });
  }
}

module.exports = {
  dealUserDeck,
  buildQuestDeckEmbed,
  handleQuestCommand,
  handleQuestInteraction
};
