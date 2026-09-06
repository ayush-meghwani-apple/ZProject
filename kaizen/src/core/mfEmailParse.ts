import type { RawEmail } from './emailParse';

export interface ParsedMfSipEmail {
  schemeName: string;
  amount: number;
  units: number;
  nav: number;
  folio: string;
  investmentDate: string;
  orderNumber: string;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function numberFrom(value: string): number {
  return Number(value.replace(/[₹,\s]/g, ''));
}

function field(text: string, label: string, nextLabel: string): string | null {
  const pattern = new RegExp(`${label}\\s*:?\\s*(.*?)\\s*(?=${nextLabel}\\s*:?)`, 'i');
  return text.match(pattern)?.[1]?.trim() || null;
}

function isoDate(value: string): string | null {
  const match = value.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 4).toLowerCase()] ?? MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
}

export function parseEtMoneySipEmail(email: RawEmail): ParsedMfSipEmail | null {
  if (!/@etmoneycare\.com\b/i.test(email.from)) return null;
  if (!/\bSIP\s+of\s+₹?[\d,]+(?:\.\d+)?\s+added\s+to\s+your\s+savings\b/i.test(`${email.subject}\n${email.body}`)) {
    return null;
  }

  const text = email.body.replace(/\s+/g, ' ').trim();
  const schemeName = field(text, 'Scheme name', 'Amount');
  const amountText = field(text, 'Amount', 'Units');
  const unitsText = field(text, 'Units', 'Price\\s*\\(NAV\\)');
  const navText = field(text, 'Price\\s*\\(NAV\\)', 'Folio No\\.?');
  const folio = field(text, 'Folio No\\.?', 'Date of Investment');
  const dateText = field(text, 'Date of Investment', 'Order Number');
  const orderNumber = field(text, 'Order Number', 'EOP Code');
  const investmentDate = dateText ? isoDate(dateText) : null;

  if (!schemeName || !amountText || !unitsText || !navText || !folio || !investmentDate || !orderNumber) {
    return null;
  }

  const amount = numberFrom(amountText);
  const units = numberFrom(unitsText);
  const nav = numberFrom(navText);
  if (!(amount > 0) || !(units > 0) || !(nav > 0)) return null;

  return { schemeName, amount, units, nav, folio, investmentDate, orderNumber };
}

export function buildMfMonthQuery(year: number, month: number, after?: Date): string {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const overlap = after ? new Date(after.getTime() - 24 * 60 * 60 * 1000) : start;
  const lower = overlap > start ? overlap : start;
  return `from:etmoneycare.com after:${Math.floor(lower.getTime() / 1000)} before:${Math.floor(end.getTime() / 1000)}`;
}