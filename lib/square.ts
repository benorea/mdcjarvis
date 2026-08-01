// Square REST API, called directly with fetch — no SDK dependency needed
// for the handful of calls this uses. DRAFT invoices only: this file has
// no publish/send capability by design. Ashley reviews and sends from her
// own Square Dashboard; Jarvis prepares, it never pulls the trigger.

import crypto from "crypto";
import { todayInBusinessTimezone } from "./timezone";

const SQUARE_API_VERSION = "2024-01-18"; // pinned for stability; bump if Square deprecates it

/** Pure calendar-day math on a "YYYY-MM-DD" string — deliberately not `new Date()` + local offsets. */
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function squareBaseUrl(): string {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

export function squareConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

async function squareFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${squareBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || JSON.stringify(data);
    throw new Error(`Square API error (${res.status}): ${detail}`);
  }
  return data;
}

async function findOrCreateCustomer(name: string, email?: string, phone?: string): Promise<string> {
  if (email) {
    const searchResult = await squareFetch("/customers/search", {
      method: "POST",
      body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } }),
    });
    const existing = searchResult.customers?.[0];
    if (existing) return existing.id;
  }

  const [given_name, ...rest] = name.trim().split(" ");
  const created = await squareFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      given_name,
      family_name: rest.join(" ") || undefined,
      email_address: email || undefined,
      phone_number: phone || undefined,
    }),
  });
  return created.customer.id;
}

export type InvoiceLineItem = { description: string; amount: number };

export type DraftInvoiceResult = {
  invoiceId: string;
  status: string;
  orderId: string;
  totalDollars: number;
};

/** Creates an ORDER + a DRAFT INVOICE referencing it. Never calls PublishInvoice. */
export async function createDraftInvoice(
  clientName: string,
  lineItems: InvoiceLineItem[],
  opts: { email?: string; phone?: string; dueDate?: string; note?: string } = {}
): Promise<DraftInvoiceResult> {
  const locationId = process.env.SQUARE_LOCATION_ID!;
  const customerId = await findOrCreateCustomer(clientName, opts.email, opts.phone);

  const order = await squareFetch("/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: locationId,
        customer_id: customerId,
        line_items: lineItems.map((item) => ({
          name: item.description,
          quantity: "1",
          base_price_money: { amount: Math.round(item.amount * 100), currency: "USD" },
        })),
      },
    }),
  });

  const dueDate = opts.dueDate || addDaysToDateString(todayInBusinessTimezone(), 7);

  const invoice = await squareFetch("/invoices", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      invoice: {
        location_id: locationId,
        order_id: order.order.id,
        primary_recipient: { customer_id: customerId },
        payment_requests: [{ request_type: "BALANCE", due_date: dueDate }],
        delivery_method: "EMAIL",
        description: opts.note || undefined,
        accepted_payment_methods: { card: true },
      },
    }),
  });

  const totalCents = order.order.total_money?.amount || 0;

  return {
    invoiceId: invoice.invoice.id,
    status: invoice.invoice.status, // should be "DRAFT" — nothing is sent until published from Square's own dashboard
    orderId: order.order.id,
    totalDollars: totalCents / 100,
  };
}
