export async function notifyUser(ctx, userId, message, keyboard) {
  try {
    await ctx.api.sendMessage(userId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (e) {
    console.error(`Failed to notify user ${userId}:`, e);
  }
}

export async function notifyAdmin(ctx, message) {
  const adminId = ctx.tenant.telegram_id;
  await notifyUser(ctx, adminId, message);
}
