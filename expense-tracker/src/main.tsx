import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { seedIfEmpty } from './storage/seed';
import { ensurePersistentStorage } from './storage/persistence';
import { SalaryCycleRepository } from './repository/salaryCycleRepository';
import { PaymentMethodRepository } from './repository/paymentMethodRepository';
import { initViewport } from './core/viewport';
import { initIosKeyboard } from './core/iosKeyboard';
import './style.css';

function renderFatal(message: string) {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <div style="max-width:520px;margin:40px auto;padding:24px;font-family:sans-serif;color:#e2e8f0">
      <h2>Couldn't open your data</h2>
      <p style="color:#94a3b8">The app failed to open its local database. Your saved
      expenses are most likely still safe on this device.</p>
      <p style="color:#94a3b8"><strong>Do NOT clear site data or uninstall.</strong>
      Reload the app, or reopen it after the update finishes. If it keeps failing,
      reinstall the latest version — your data stays in the browser's storage.</p>
      <pre style="white-space:pre-wrap;background:#1e293b;padding:12px;border-radius:8px;font-size:12px">${message}</pre>
    </div>`;
}

async function bootstrap() {
  // Keep the app box glued to the visible viewport (above the keyboard).
  initViewport();

  // Hide iOS Safari's keyboard prev/next accessory bar (multi-field detection).
  initIosKeyboard();

  // Ask the browser to keep our storage durable so iOS/Safari won't evict the
  // IndexedDB database after periods of inactivity.
  await ensurePersistentStorage().catch(() => {});

  try {
    await seedIfEmpty();
    // Give existing installs the default payment methods too (no-op if any exist).
    await PaymentMethodRepository.ensureDefaults().catch(() => {});
    // Keep every expense filed under the cycle its date falls in (self-heals
    // expenses added before a cycle existed, or imported from a backup).
    await SalaryCycleRepository.reassignExpensesByDate().catch(() => {});
  } catch (err) {
    // A failed open/migration must NEVER silently wipe data — surface it instead.
    renderFatal((err as Error)?.message ?? String(err));
    return;
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
