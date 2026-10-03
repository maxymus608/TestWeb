// Вставити в Google Таблицю: Розширення → Apps Script
// Аркуш "Товари": id | category | name | price | stock | image | description
// Аркуш "Замовлення": порожній, без заголовків (скрипт сам додає рядки; номер замовлення = номер рядка)
// Telegram: ⚙ Налаштування проєкту → Властивості скрипта → TG_TOKEN (токен бота) і TG_CHAT (ваш chat id)

const PRODUCTS = "Товари", ORDERS = "Замовлення";

const f = (v, m) => String(v || "").trim().slice(0, m);
const c = v => /^[=+\-@]/.test(v) ? "'" + v : v; // захист від формул у таблиці

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Сайт читає каталог
function doGet() {
  const rows = SpreadsheetApp.getActive().getSheetByName(PRODUCTS).getDataRange().getValues();
  const head = rows.shift();
  const items = rows.filter(r => r[0] !== "").map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
  return out(items);
}

// Сайт надсилає замовлення
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // щоб два покупці одночасно не купили останню одиницю
  try {
    const o = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(PRODUCTS);
    const data = sh.getDataRange().getValues();
    const h = data[0], iId = h.indexOf("id"), iName = h.indexOf("name"), iPrice = h.indexOf("price"), iStock = h.indexOf("stock");

    const name = f(o.name, 80), phone = f(o.phone, 30), comment = f(o.comment, 300),
          method = f(o.method, 60), city = f(o.city, 80), addr = f(o.address, 150);
    if (!name || !phone || !method || !city || !addr || !Array.isArray(o.lines) || !o.lines.length)
      return out({ ok: false, error: "Заповніть імʼя, телефон, доставку та кошик" });
    if (o.agree !== true) return out({ ok: false, error: "Потрібна згода з публічною офертою" });

    let total = 0; const text = [], updates = [];
    for (const l of o.lines) {
      const qty = Math.floor(Number(l.qty));
      const idx = data.findIndex((r, i) => i > 0 && String(r[iId]) === String(l.id));
      if (idx < 0 || !(qty > 0)) return out({ ok: false, error: "Товар не знайдено" });
      const row = data[idx];
      if (Number(row[iStock]) < qty) return out({ ok: false, error: "Недостатньо на складі: " + row[iName] });
      updates.push([idx + 1, Number(row[iStock]) - qty]);
      total += qty * Number(row[iPrice]);
      text.push(row[iName] + " × " + qty);
    }
    updates.forEach(([r, s]) => sh.getRange(r, iStock + 1).setValue(s));

    const orders = ss.getSheetByName(ORDERS);
    orders.appendRow([new Date(), c(name), c(phone), c(comment), text.join("; "), total, c(method), c(city), c(addr), "оферта від " + f(o.offer, 20)]);
    const id = orders.getLastRow();

    lock.releaseLock(); // мережевий запит до Telegram робимо вже без блокування
    notify(["🛒 Нове замовлення №" + id, "👤 " + name, "📞 " + phone, "🚚 " + method,
            "📍 " + city + ", " + addr, "📦 " + text.join("\n📦 "), "💰 " + total + " грн",
            comment ? "💬 " + comment : "", "📄 Оферту прийнято (від " + f(o.offer, 20) + ")"].filter(Boolean).join("\n"));
    return out({ ok: true, id: id });
  } catch (err) {
    return out({ ok: false, error: "Помилка сервера" });
  } finally {
    lock.releaseLock();
  }
}

// Повідомлення в Telegram. Токен і chat id зберігаються у властивостях скрипта, а не на сайті
function notify(text) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty("TG_TOKEN"), chat = p.getProperty("TG_CHAT");
  if (!token || !chat) return;
  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chat, text: text })
    });
  } catch (e) { /* збій Telegram не повинен ламати замовлення */ }
}

// Запустіть один раз вручну в редакторі: дасть дозвіл на запити назовні й перевірить зв'язок з ботом
function testTelegram() {
  notify("✅ Бот підключено до магазину");
}
