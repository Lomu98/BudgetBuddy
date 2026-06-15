/**
 * Script di importazione movimenti bancari BCC - Ultimi 3 mesi
 * Utilizzo: node scripts/import-bcc.mjs <percorso-service-account.json> <uid-utente>
 *
 * Come ottenere i parametri:
 *  - service-account.json: Firebase Console > Impostazioni progetto > Account di servizio > Genera nuova chiave privata
 *  - uid-utente: Firebase Console > Authentication > Users > colonna "User UID"
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const [,, serviceAccountPath, userId] = process.argv;

if (!serviceAccountPath || !userId) {
  console.error('Utilizzo: node scripts/import-bcc.mjs <percorso-service-account.json> <uid-utente>');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// --- TRANSAZIONI ESTRATTE DAL PDF ---
const transactionsRaw = [
  // GIUGNO 2026
  { date: '2026-06-15', amount: 364.23,   type: 'expense', description: 'Rata auto - Volkswagen Bank',                            category: 'Rata Auto' },
  { date: '2026-06-15', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-06-15', amount: 72.00,    type: 'expense', description: 'Bolletta Gas - Simecom',                                 category: 'Utenze' },
  { date: '2026-06-15', amount: 1760.66,  type: 'expense', description: 'Carta di Credito CCC Direct Issuing',                    category: 'Carta di Credito' },
  { date: '2026-06-10', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-06-10', amount: 350.00,   type: 'expense', description: 'Trasferimento su Revolut',                               category: 'Trasferimenti' },
  { date: '2026-06-10', amount: 1837.00,  type: 'income',  description: 'Stipendio - Engage SPA (Maggio 2026)',                   category: 'Stipendio' },
  { date: '2026-06-08', amount: 50.00,    type: 'income',  description: 'PAC - Co\' Virginia Marchetti Raffaella (Girofondi)',    category: 'Entrate Varie' },
  { date: '2026-06-05', amount: 150.00,   type: 'expense', description: 'Prelievo Bancomat',                                      category: 'Prelievi' },
  { date: '2026-06-04', amount: 162.20,   type: 'income',  description: 'Rimborso KM - Virtus Lonato',                            category: 'Rimborsi' },
  // MAGGIO 2026
  { date: '2026-05-29', amount: 61.12,    type: 'expense', description: 'Bolletta Internet - Intred SPA',                         category: 'Utenze' },
  { date: '2026-05-28', amount: 16.54,    type: 'expense', description: 'Bolletta Energia - A2A S.P.A.',                          category: 'Utenze' },
  { date: '2026-05-26', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-05-26', amount: 72.00,    type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-05-21', amount: 57.00,    type: 'expense', description: 'Bolletta Luce - Simecom',                                category: 'Utenze' },
  { date: '2026-05-21', amount: 10.00,    type: 'expense', description: 'Donazione - Amnesty International',                      category: 'Donazioni' },
  { date: '2026-05-20', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-05-20', amount: 100.75,   type: 'expense', description: 'Piano di accumulo - Scalable Capital',                   category: 'Investimenti' },
  { date: '2026-05-18', amount: 100.00,   type: 'expense', description: 'Prelievo Bancomat',                                      category: 'Prelievi' },
  { date: '2026-05-18', amount: 1090.61,  type: 'expense', description: 'Carta di Credito CCC Direct Issuing',                    category: 'Carta di Credito' },
  { date: '2026-05-18', amount: 132.00,   type: 'expense', description: 'Bolletta Gas - Simecom',                                 category: 'Utenze' },
  { date: '2026-05-18', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-05-18', amount: 75.00,    type: 'expense', description: 'Risparmi mensili per bolli',                             category: 'Risparmi' },
  { date: '2026-05-15', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-05-15', amount: 364.23,   type: 'expense', description: 'Rata auto - Volkswagen Bank',                            category: 'Rata Auto' },
  { date: '2026-05-14', amount: 50.00,    type: 'expense', description: 'Fondo Investiper Etico Bilanciato',                      category: 'Investimenti' },
  { date: '2026-05-12', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-05-12', amount: 29.99,    type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-05-08', amount: 1828.00,  type: 'income',  description: 'Stipendio - Engage SPA (Aprile 2026)',                   category: 'Stipendio' },
  { date: '2026-05-08', amount: 50.00,    type: 'income',  description: 'PAC - Co\' Virginia Marchetti Raffaella (Girofondi)',    category: 'Entrate Varie' },
  { date: '2026-05-07', amount: 6.22,     type: 'income',  description: 'Bonifico in entrata - Bertola Gloria Maria',             category: 'Entrate Varie' },
  { date: '2026-05-07', amount: 113.00,   type: 'income',  description: 'Bonifico in entrata - Cerutti Andrea (Vacanza)',         category: 'Entrate Varie' },
  { date: '2026-05-05', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-05-05', amount: 15.75,    type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-05-04', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-05-04', amount: 350.00,   type: 'expense', description: 'Trasferimento su Revolut',                               category: 'Trasferimenti' },
  // APRILE 2026
  { date: '2026-04-28', amount: 250.00,   type: 'income',  description: 'Bonifico in entrata - Andrea Lomurno (Quota Bollo Auto)', category: 'Rimborsi' },
  { date: '2026-04-28', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-28', amount: 279.92,   type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-04-28', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-28', amount: 108.92,   type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-04-23', amount: 10.00,    type: 'expense', description: 'Donazione - Amnesty International',                      category: 'Donazioni' },
  { date: '2026-04-20', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-20', amount: 100.50,   type: 'expense', description: 'Piano di accumulo - Scalable Capital',                   category: 'Investimenti' },
  { date: '2026-04-20', amount: 52.00,    type: 'expense', description: 'Bolletta Luce - Simecom',                                category: 'Utenze' },
  { date: '2026-04-20', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-04-20', amount: 75.00,    type: 'expense', description: 'Risparmi mensili per bolli',                             category: 'Risparmi' },
  { date: '2026-04-16', amount: 1019.80,  type: 'expense', description: 'Carta di Credito CCC Direct Issuing',                    category: 'Carta di Credito' },
  { date: '2026-04-15', amount: 127.00,   type: 'expense', description: 'Bolletta Gas - Simecom',                                 category: 'Utenze' },
  { date: '2026-04-15', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-15', amount: 364.23,   type: 'expense', description: 'Rata auto - Volkswagen Bank',                            category: 'Rata Auto' },
  { date: '2026-04-14', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-14', amount: 112.00,   type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-04-10', amount: 1890.00,  type: 'income',  description: 'Stipendio - Engage SPA (Marzo 2026)',                    category: 'Stipendio' },
  { date: '2026-04-10', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-04-10', amount: 2.07,     type: 'expense', description: 'Pagamento PayPal',                                       category: 'Acquisti Online' },
  { date: '2026-04-10', amount: 61.12,    type: 'expense', description: 'Bolletta Internet - Intred SPA',                         category: 'Utenze' },
  { date: '2026-04-09', amount: 50.00,    type: 'expense', description: 'Fondo Investiper Etico Bilanciato',                      category: 'Investimenti' },
  { date: '2026-04-08', amount: 2.10,     type: 'expense', description: 'Bolli dossier titoli',                                   category: 'Commissioni Bancarie' },
  { date: '2026-04-08', amount: 50.00,    type: 'income',  description: 'PAC - Co\' Virginia Marchetti Raffaella (Girofondi)',    category: 'Entrate Varie' },
  { date: '2026-04-02', amount: 3.50,     type: 'expense', description: 'Interessi e competenze bancarie',                        category: 'Commissioni Bancarie' },
  { date: '2026-04-01', amount: 90.99,    type: 'income',  description: 'Rimborso KM - Virtus Lonato',                            category: 'Rimborsi' },
  { date: '2026-04-01', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-04-01', amount: 350.00,   type: 'expense', description: 'Trasferimento su Revolut',                               category: 'Trasferimenti' },
  // MARZO 2026
  { date: '2026-03-25', amount: 21.00,    type: 'expense', description: 'Ricarica Satispay',                                      category: 'Acquisti Online' },
  { date: '2026-03-23', amount: 61.00,    type: 'expense', description: 'Bolletta Luce - Simecom',                                category: 'Utenze' },
  { date: '2026-03-19', amount: 10.00,    type: 'expense', description: 'Donazione - Amnesty International',                      category: 'Donazioni' },
  { date: '2026-03-19', amount: 1.50,     type: 'expense', description: 'Commissioni richiesta incasso SEPA',                     category: 'Commissioni Bancarie' },
  { date: '2026-03-19', amount: 100.25,   type: 'expense', description: 'Piano di accumulo - Scalable Capital',                   category: 'Investimenti' },
  { date: '2026-03-18', amount: 939.58,   type: 'expense', description: 'Carta di Credito CCC Direct Issuing',                    category: 'Carta di Credito' },
  { date: '2026-03-18', amount: 145.00,   type: 'expense', description: 'Bolletta Gas - Simecom',                                 category: 'Utenze' },
  { date: '2026-03-18', amount: 0.30,     type: 'expense', description: 'Commissioni bonifico',                                   category: 'Commissioni Bancarie' },
  { date: '2026-03-18', amount: 75.00,    type: 'expense', description: 'Risparmi mensili per bolli',                             category: 'Risparmi' },
];

async function main() {
  const accountName = 'BCC Colli Morenici';

  // Cerca conto esistente
  const accountsSnap = await db.collection('accounts')
    .where('userId', '==', userId)
    .where('name', '==', accountName)
    .get();

  let accountId;
  if (!accountsSnap.empty) {
    accountId = accountsSnap.docs[0].id;
    console.log(`Conto trovato: ${accountId}`);
  } else {
    const newAcc = await db.collection('accounts').add({
      userId,
      name:           accountName,
      type:           'bank',
      balance:        -628.72,
      colorId:        'emerald',
      includeInTotal: true,
      status:         'active',
      createdAt:      new Date().toISOString(),
    });
    accountId = newAcc.id;
    console.log(`Conto creato: ${accountId}`);
  }

  // Importa in batch (max 500 op per batch)
  let batch = db.batch();
  let count = 0;

  for (const tx of transactionsRaw) {
    const ref = db.collection('transactions').doc();
    batch.set(ref, {
      userId,
      accountId,
      paymentMethod: accountName,
      date:          tx.date,
      description:   tx.description,
      amount:        tx.amount,
      type:          tx.type,
      category:      tx.category,
      status:        'completed',
      isRecurring:   false,
      importedAt:    new Date().toISOString(),
    });
    count++;

    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`Committati ${count} documenti...`);
    }
  }

  await batch.commit();
  console.log(`\nFatto! ${count} transazioni importate sul conto "${accountName}".`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
