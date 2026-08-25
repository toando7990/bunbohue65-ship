// ============================================================
// routes/invoice.js — Bkav eHoadon
// ============================================================
// Frontend (vps-client.ts) calls:
//   GET  /invoice/:orderId          → InvoiceResponse (camelCase)
//   POST /invoice/:orderId/email   → InvoiceResponse (camelCase)
// InvoiceResponse: { invoiceId, invoiceUrl, sharedLink, ok, error? }
//
// Legacy endpoints (kept for backward compat):
//   GET  /order/:id/invoice
//   POST /order/:id/invoice/email
//
// Cron 1 phút: tạo invoice cho completed + paid + chưa invoiced.
// ============================================================

const express = require('express');
const cron = require('node-cron');
const bkav = require('../lib/bkav');
const canister = require('../lib/canister');
const nodemailer = require('nodemailer');
const shutdown = require('../lib/shutdown');

const router = express.Router();

// Seri hoá đơn production Bkav — công ty đã có seri riêng (C26MAA), không
// dùng seri demo/auto-assign. Đổi qua biến môi trường BKAV_PROD_INVOICE_SERIAL
// nếu seri thay đổi sau này, không cần sửa code.
const PROD_INVOICE_SERIAL = process.env.BKAV_PROD_INVOICE_SERIAL || 'C26MAA';

// Cron 1 phút: tạo invoice cho các order completed + paid + chưa invoiced.
// Sau khi createInvoice thành công, gọi getInvoicePdf816(orderId) ngay để
// lấy PDF URL (CmdType 816 theo PartnerInvoiceStringID = orderId).
// Retry 3 lần cho getInvoicePdf816 — nếu retry thất bại, dùng pdfUrl="".
// Cuối cùng push canister.updateInvoiceStatus(orderId, status, invoiceId, pdfUrl, hmac).
function startInvoiceCron(db) {
  const task = cron.schedule('* * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const rows = db.prepare(
        `SELECT * FROM orders WHERE booking_status = 'completed' AND payment_status = 'paid' AND invoice_status = 'none'`,
      ).all();
      for (const row of rows) {
        try {
          const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.order_id);
          // isRetailInvoice: khách có nhập mã số thuế lúc đặt món → phát
          // hành hoá đơn CÔNG TY (buyerName/buyerTaxCode/buyerAddress thật);
          // không nhập → hoá đơn bán lẻ "Bán cho người tiêu dùng" như cũ.
          const hasTaxCode = !!(row.cus_tax_code && row.cus_tax_code.trim());
          const inv = await bkav.createInvoice(
            {
              orderId: row.order_id, cusName: row.cus_name, cusTaxCode: row.cus_tax_code,
              cusAddress: row.cus_address, items, amount: row.amount,
              goodsAmount: row.goods_amount, taxTotal: row.tax_total,
              receiverEmail: row.receiver_email,
              isRetailInvoice: !hasTaxCode,
            },
            { prodInvoiceSerial: PROD_INVOICE_SERIAL },
          );
          // ĐÚNG field trả về từ createInvoice() là invoiceNo (KHÔNG phải
          // invoice_id — lỗi cũ khiến field này luôn undefined, mọi hoá đơn
          // tạo THÀNH CÔNG bị đánh dấu 'failed' sai, mất luôn invoiceNo/
          // maCQT/maTraCuu vì log raw response cũng nằm trong nhánh không
          // bao giờ chạy tới). Ghi log raw response TRƯỚC, LUÔN LUÔN — dù
          // thành công hay thất bại — để không bao giờ mất dấu vết nữa.
          const invoiceNo = inv.invoiceNo;
          db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, response_xml, created_at) VALUES (?, ?, 'CreateInvoice', ?, ?)`)
            .run(row.order_id, invoiceNo || '', JSON.stringify(inv.raw), Date.now());

          if (invoiceNo) {
            // Lấy PDF URL qua CmdType 816 ngay sau khi tạo invoice thành công.
            // Retry 3 lần — giống cơ chế retry của processInvoice hiện có.
            // Nếu retry thất bại, dùng pdfUrl="" (chuỗi rỗng).
            let pdfUrl = '';
            let pdf816Ok = false;
            // Backoff giữa các attempt: không delay trước lần 1,
            // 2000ms trước lần 2, 5000ms trước lần 3.
            const pdf816BackoffMs = [0, 2000, 5000];
            for (let attempt = 1; attempt <= 3; attempt++) {
              if (pdf816BackoffMs[attempt - 1] > 0) {
                await new Promise((r) => setTimeout(r, pdf816BackoffMs[attempt - 1]));
              }
              try {
                const pdf = await bkav.getInvoicePdf816(row.order_id);
                if (pdf && pdf.pdf_url) {
                  pdfUrl = pdf.pdf_url;
                  pdf816Ok = true;
                  break;
                }
                // pdf === null: Bkav báo lỗi/isOk=false → vẫn retry tiếp.
                console.warn(`[invoice/cron] getInvoicePdf816 attempt ${attempt}/3 returned null for ${row.order_id}`);
              } catch (e) {
                console.warn(`[invoice/cron] getInvoicePdf816 attempt ${attempt}/3 failed for ${row.order_id}: ${e.message}`);
              }
            }
            if (!pdf816Ok) {
              console.warn(`[invoice/cron] getInvoicePdf816 exhausted 3 retries for ${row.order_id} — using pdfUrl=""`);
            }

            // Push canister với 5 tham số: orderId, invoiceStatus, invoiceId, pdfUrl, hmac.
            await canister.updateInvoiceStatus(row.order_id, 'invoiced', invoiceNo, pdfUrl);
            db.prepare(`UPDATE orders SET invoice_status = 'invoiced', invoice_id = ?, updated_at = ? WHERE order_id = ?`)
              .run(invoiceNo, Date.now(), row.order_id);
            if (pdf816Ok) {
              db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, response_xml, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
                .run(row.order_id, invoiceNo, JSON.stringify({ pdf_url: pdfUrl }), Date.now());
            } else {
              db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
                .run(row.order_id, invoiceNo, 'exhausted 3 retries — pdf_url empty', Date.now());
            }
          } else {
            // Bkav không trả invoiceNo → thất bại thật (raw response đã log ở
            // trên để xem nguyên nhân cụ thể qua inv.error/errorCode).
            console.error(`[invoice/cron] CreateInvoice: no invoiceNo for ${row.order_id} — ${inv.error || 'unknown'} (code=${inv.errorCode || ''})`);
            await canister.updateInvoiceStatus(row.order_id, 'failed', '', '');
            db.prepare(`UPDATE orders SET invoice_status = 'failed', updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), row.order_id);
          }
        } catch (e) {
          console.error('[invoice/cron] CreateInvoice failed:', row.order_id, e.message);
          db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'CreateInvoice', ?, ?)`)
            .run(row.order_id, e.message, Date.now());
        }
      }
    } catch (e) {
      console.error('[invoice/cron] fatal:', e.message);
    }
  });
  return task;
}

// Helper: build InvoiceResponse (camelCase) cho một order.
// Dùng getInvoicePdf816(orderId) (CmdType 816, theo PartnerInvoiceStringID)
// thay vì getInvoicePdf(invoiceId) cũ — 2 API Bkav khác nhau; cron đã tự
// chứng minh 816 hoạt động ổn định, endpoint khách hàng trước đây vẫn dùng
// API cũ, không đồng bộ.
async function buildInvoiceResponse(db, orderId) {
  const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId);
  if (!row) return { status: 404, body: { ok: false, error: 'order not found' } };
  if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
    return { status: 404, body: { ok: false, error: 'invoice not yet issued' } };
  }
  try {
    const pdf = await bkav.getInvoicePdf816(orderId);
    return {
      status: 200,
      body: {
        invoiceId: row.invoice_id,
        invoiceUrl: pdf?.pdf_url || '',
        sharedLink: row.shared_link || '',
        ok: true,
      },
    };
  } catch (e) {
    db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
      .run(orderId, row.invoice_id, e.message, Date.now());
    return { status: 502, body: { ok: false, error: `GetInvoicePDF816 failed: ${e.message}` } };
  }
}

// GET /invoice/:orderId — frontend contract (camelCase)
router.get('/invoice/:orderId', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, body } = await buildInvoiceResponse(db, req.params.orderId);
    return res.status(status).json(body);
  } catch (e) {
    next(e);
  }
});

// POST /invoice/:orderId/email — frontend contract (camelCase)
router.post('/invoice/:orderId/email', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.orderId);
    if (!row) return res.status(404).json({ ok: false, error: 'order not found' });
    if (!row.receiver_email) return res.status(400).json({ ok: false, error: 'no receiver_email on order' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ ok: false, error: 'invoice not yet issued' });
    }

    let pdfUrl = '';
    try {
      const pdf = await bkav.getInvoicePdf816(req.params.orderId);
      pdfUrl = pdf?.pdf_url || '';
    } catch (e) {
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
        .run(req.params.orderId, row.invoice_id, e.message, Date.now());
      return res.status(502).json({ ok: false, error: `GetInvoicePDF816 failed: ${e.message}` });
    }
    if (!pdfUrl) return res.status(502).json({ ok: false, error: 'GetInvoicePDF816 returned no url' });

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER, to: row.receiver_email,
        subject: `Hóa đơn điện tử Bunbohue65 — đơn ${row.order_id}`,
        text: `Cảm ơn quý khách đã đặt hàng.\n\nLink tải hóa đơn: ${pdfUrl}\n\nBunbohue65`,
      });
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, created_at) VALUES (?, ?, 'email', ?)`)
        .run(row.order_id, row.invoice_id, Date.now());
    } catch (e) {
      return res.status(502).json({ ok: false, error: `email send failed: ${e.message}` });
    }

    res.json({
      invoiceId: row.invoice_id,
      invoiceUrl: pdfUrl,
      sharedLink: row.shared_link || '',
      ok: true,
    });
  } catch (e) {
    next(e);
  }
});

// GET /order/:id/invoice — legacy (snake_case)
router.get('/order/:id/invoice', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT invoice_id, invoice_status, shared_link FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ error: 'invoice not yet issued' });
    }
    try {
      const pdf = await bkav.getInvoicePdf816(req.params.id);
      res.json({ invoice_id: row.invoice_id, pdf_url: pdf?.pdf_url || '', shared_link: row.shared_link });
    } catch (e) {
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
        .run(req.params.id, row.invoice_id, e.message, Date.now());
      res.status(502).json({ error: 'GetInvoicePDF816 failed', detail: e.message });
    }
  } catch (e) {
    next(e);
  }
});

// POST /order/:id/invoice/email — legacy (snake_case)
router.post('/order/:id/invoice/email', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    if (!row.receiver_email) return res.status(400).json({ error: 'no receiver_email on order' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ error: 'invoice not yet issued' });
    }
    const pdf = await bkav.getInvoicePdf816(req.params.id);
    if (!pdf?.pdf_url) return res.status(502).json({ error: 'GetInvoicePDF816 returned no url' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER, to: row.receiver_email,
      subject: `Hóa đơn điện tử Bunbohue65 — đơn ${row.order_id}`,
      text: `Cảm ơn quý khách đã đặt hàng.\n\nLink tải hóa đơn: ${pdf.pdf_url}\n\nBunbohue65`,
    });
    db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, created_at) VALUES (?, ?, 'email', ?)`)
      .run(row.order_id, row.invoice_id, Date.now());
    res.json({ ok: true, sent_to: row.receiver_email });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.startInvoiceCron = startInvoiceCron;
