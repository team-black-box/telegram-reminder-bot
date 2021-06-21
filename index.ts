import {
  startConfigurator,
  parseResponse,
  getTimezone,
} from "./TimezoneConfigurator";
import { remindClause } from "./reminders";

require("dotenv").config();
const { Telegraf } = require("telegraf");

const pendingDuration = new Set();
const reminderTexts = {};

interface ReminderLogEntry {
  text: string;
  chatId: number;
}

interface ReminderLog {
  [key: number]: ReminderLogEntry[];
}

let reminderLog: ReminderLog = {
  0: [],
};

let currentSecond = 0;

const reminderDaemon = setInterval(() => {
  console.log(`starting daemon at ${currentSecond}`);
  const remindersToSend = reminderLog[currentSecond];
  if (remindersToSend?.length > 0) {
    console.log(JSON.stringify(remindersToSend));
    remindersToSend.forEach((each) =>
      bot.telegram.sendMessage(each.chatId, `REMINDER\n\n${each.text}`)
    );
  }
  currentSecond = currentSecond + 1;
}, 1000);

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on("callback_query", (ctx) => {
  parseResponse(ctx.callbackQuery.data, ctx);
  ctx.answerCbQuery();
});

bot.on("message", async (ctx) => {
  const chatId = ctx.message.chat.id;
  const message = ctx.message.text;
  if (pendingDuration.has(chatId)) {
    const durations = remindClause(message, await getTimezone(ctx));
    if (durations && durations.length > 0) {
      pendingDuration.delete(chatId);
      bot.telegram.sendMessage(
        chatId,
        `Kelzo will remind you about ${reminderTexts[chatId]}`
      );
      const reminderText = reminderTexts[chatId];
      const timeKeys = durations.map((each) => {
        const recur = Math.ceil(each.toMillis() / 1000);
        console.log(`TIMEKEY: ${currentSecond + recur}`);
        return currentSecond + recur;
      });
      const transformedTimeKeys = timeKeys.reduce((acc, each) => {
        const updatedReminders = reminderLog[each]
          ? [...reminderLog[each], { chatId, text: reminderText }]
          : [{ chatId, text: reminderText }];
        acc[each] = updatedReminders;
        return acc;
      }, {});
      reminderLog = {
        ...reminderLog,
        ...transformedTimeKeys,
      };
    } else {
      bot.telegram.sendMessage(
        chatId,
        `That is not a valid spec OK! Try Again!
        \nFor example 'In 2 years 3 days 4 seconds'\nor 'On 13-06-2022 at 11:45'\nor 'Every weekday'`
      );
    }
  } else {
    // users are trying to start a conversation with the bot
    reminderTexts[chatId] = message;
    if (startConfigurator(ctx)) {
      bot.telegram.sendMessage(
        chatId,
        `When would you like me to remind you of ${message}?
        \nYou can reply with 'In 2 years 3 days 4 seconds'\nor 'On 13-06-2022 at 11:45'\nor 'Every weekday'`
      );
    }
    pendingDuration.add(chatId);
  }
});

bot.launch();

// graceful stopping
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
