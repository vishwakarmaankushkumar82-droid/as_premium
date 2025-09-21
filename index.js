const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const bodyParser = require("body-parser");

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID; // jaha proofs jayenge
const GROUP_INVITE_LINK = process.env.GROUP_INVITE_LINK; // premium group ka link

if (!BOT_TOKEN) {
  console.error("Error: TELEGRAM_TOKEN not found");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// memory me temporary store (demo ke liye)
// real me DB use karna chahiye
let pendingApprovals = {};

bot.start((ctx) => {
  const caption = `
🎬 *AS-Cinemaa Movie Group Premium Plans*

🍿 Movies & Web-Series & CID only

1 Month - ₹15 | 2 Months - ₹30 | 4 Months - ₹50

HD Quality | Unlimited Access | New Releases Added Weekly ✅

💰 *Pay-Per-Video Option*
Any 1 Video - ₹2 | Any 5 Videos - ₹10

⚡ Why Go Premium?
No Ads | Fast Direct Download | HD Quality | Early Access to New Releases | Web-Series, Movies, Serials & Cartoons – All in One Place

Once confirmed, your Premium Access will be activated instantly! 🎉
  `;

  ctx.replyWithPhoto(
    { source: "assets/plans.jpg" },
    {
      caption,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💳 Buy Subscription", "buy_sub")],
        [Markup.button.callback("🎥 Pay Per Video", "pay_video")],
      ]),
    }
  );
});

// --- Subscription Plans ---
bot.action("buy_sub", (ctx) => {
  ctx.reply(
    "Choose your subscription plan:",
    Markup.inlineKeyboard([
      [Markup.button.callback("1 Month - ₹15", "plan_1")],
      [Markup.button.callback("2 Months - ₹30", "plan_2")],
      [Markup.button.callback("4 Months - ₹50", "plan_4")],
    ])
  );
});

// --- Pay Per Video Plans ---
bot.action("pay_video", (ctx) => {
  ctx.reply(
    "Choose your pay-per-video option:",
    Markup.inlineKeyboard([
      [Markup.button.callback("1 Video - ₹2", "ppv_1")],
      [Markup.button.callback("5 Videos - ₹10", "ppv_5")],
    ])
  );
});

// Helper function: send payment instruction
function askForPayment(ctx, type, label) {
  const userId = ctx.from.id;
  pendingApprovals[userId] = { type, label };

  ctx.replyWithPhoto(
    { source: "assets/plans.jpg" },
    {
      caption: `💳 *${label}*\n\nPlease pay & send payment screenshot.`,
      parse_mode: "Markdown",
    }
  );
}

// --- Plan clicks ---
bot.action("plan_1", (ctx) => askForPayment(ctx, "subscription", "1 Month - ₹15"));
bot.action("plan_2", (ctx) => askForPayment(ctx, "subscription", "2 Months - ₹30"));
bot.action("plan_4", (ctx) => askForPayment(ctx, "subscription", "4 Months - ₹50"));

bot.action("ppv_1", (ctx) => askForPayment(ctx, "ppv", "1 Video - ₹2"));
bot.action("ppv_5", (ctx) => askForPayment(ctx, "ppv", "5 Videos - ₹10"));

// --- When user sends photo (proof) ---
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  if (!pendingApprovals[userId]) return;

  await ctx.reply("📩 Payment proof received. Waiting for admin approval...");

  // Forward to admin group
  const fileId = ctx.message.photo.pop().file_id;
  const caption = `Payment proof from @${ctx.from.username || ctx.from.id}
Type: ${pendingApprovals[userId].type}
Plan: ${pendingApprovals[userId].label}
UserID: ${userId}`;

  await bot.telegram.sendPhoto(ADMIN_GROUP_ID, fileId, {
    caption,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve_${userId}` },
          { text: "❌ Reject", callback_data: `reject_${userId}` },
        ],
      ],
    },
  });
});

// --- Admin approves/rejects ---
bot.action(/approve_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  const record = pendingApprovals[userId];
  if (!record) return ctx.reply("Already processed.");

  delete pendingApprovals[userId];

  if (record.type === "subscription") {
    await bot.telegram.sendMessage(
      userId,
      `✅ Approved successfully!\n\nWelcome to Premium!\nHere is your group link: ${GROUP_INVITE_LINK}\n\nPlan: ${record.label}`
    );
  } else if (record.type === "ppv") {
    await bot.telegram.sendMessage(
      userId,
      `✅ Approved!\n\nPlease send your movie name now 🎥`
    );
    // mark user awaiting movie
    pendingApprovals[userId] = { type: "waiting_movie" };
  }

  await ctx.editMessageText(`✅ Approved ${userId}`);
});

bot.action(/reject_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  delete pendingApprovals[userId];
  await bot.telegram.sendMessage(userId, "❌ Your payment was rejected.");
  await ctx.editMessageText(`❌ Rejected ${userId}`);
});

// --- Handle movie request (after PPV approval) ---
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  if (pendingApprovals[userId]?.type === "waiting_movie") {
    const movieName = ctx.message.text;
    await ctx.reply(`🎬 Your movie request received: *${movieName}*.\nAdmin will send shortly.`, { parse_mode: "Markdown" });

    // notify admin group
    await bot.telegram.sendMessage(ADMIN_GROUP_ID, `Movie request from @${ctx.from.username || userId}: ${movieName}`);

    delete pendingApprovals[userId];
  }
});


// --- Express server for webhook ---
const app = express();
app.use(bodyParser.json());
app.post(`/webhook/${process.env.WEBHOOK_SECRET || "secret"}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (req, res) => res.send("Bot is running."));
app.listen(process.env.PORT || 3000, () => console.log("Server started"));
