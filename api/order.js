// api/order.js — Vercel-функція: приймає замовлення з сайту й надсилає його вам у Telegram.
// Токен і chat id беруться зі змінних середовища Vercel (TG_TOKEN, TG_CHAT), у код їх вписувати не треба.
 
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
 
  const token = process.env.TG_TOKEN, chat = process.env.TG_CHAT;
  if (!token || !chat) return res.status(500).json({ ok: false, error: "Бот ще не налаштований" });
 
  let o;
  try { o = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); }
  catch (e) { return res.status(400).json({ ok: false, error: "Некоректні дані" }); }
 
  const f = (v, m) => String(v || "").trim().slice(0, m);
  const name = f(o.name, 80), phone = f(o.phone, 30), comment = f(o.comment, 300),
        method = f(o.method, 60), city = f(o.city, 80), addr = f(o.address, 150);
 
  if (!name || !phone || !method || !city || !addr || !Array.isArray(o.lines) || !o.lines.length)
    return res.status(400).json({ ok: false, error: "Заповніть імʼя, телефон, доставку та кошик" });
  if (o.agree !== true) return res.status(400).json({ ok: false, error: "Потрібна згода з публічною офертою" });
 
  const id = Date.now().toString(36).slice(-5).toUpperCase();
  const items = o.lines.slice(0, 50).map(l =>
    "📦 " + f(l.name, 100) + " × " + (Math.floor(Number(l.qty)) || 0) + " (" + (Number(l.price) || 0) + " грн)");
 
  const text = [
    "🛒 Нове замовлення #" + id,
    "👤 " + name,
    "📞 " + phone,
    "🚚 " + method,
    "📍 " + city + ", " + addr,
    ...items,
    "💰 " + (Number(o.total) || 0) + " грн",
    comment ? "💬 " + comment : "",
    "📄 Оферту прийнято (від " + f(o.offer, 20) + ")"
  ].filter(Boolean).join("\n").slice(0, 4000);
 
  try {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text })
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: "Telegram не прийняв повідомлення" });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Немає звʼязку з Telegram" });
  }
  res.status(200).json({ ok: true, id });
};
