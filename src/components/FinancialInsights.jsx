import React from 'react';
import { isBefore, parseISO, getDate, setDate, addMonths, isAfter, startOfDay } from 'date-fns';

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

function FinancialInsights({ accounts, transactions, budgets, goals }) {
    const alerts = [];
    const today = startOfDay(new Date());

    // Helper: Calcola la data del prossimo addebito
    const getNextPaymentDate = (dayOfMonth) => {
        let date = setDate(today, dayOfMonth);
        if (isAfter(today, date)) {
            date = addMonths(date, 1);
        }
        return date;
    };

    // 1. ANALISI CARTE DI CREDITO (Proiezione Avanzata)
    const creditCards = accounts.filter(a => a.type === 'credit');
    
    creditCards.forEach(card => {
        const currentDebt = Math.abs(card.balance); // Debito attuale consolidato
        
        if (card.linkedBankId) {
            const bank = accounts.find(a => a.id === card.linkedBankId);
            
            if (bank) {
                // A. Calcola la data del prossimo addebito
                const paymentDate = getNextPaymentDate(card.paymentDay || 15);
                
                // B. Calcola le spese/entrate PROGRAMMATE sul conto bancario prima di quella data
                const scheduledFlow = transactions
                    .filter(t => 
                        t.status === 'scheduled' && 
                        t.accountId === bank.id &&
                        isBefore(parseISO(t.date), paymentDate)
                    )
                    .reduce((acc, t) => {
                        return t.type === 'income' ? acc + t.amount : acc - t.amount;
                    }, 0);

                // C. Calcola spese PROGRAMMATE sulla carta stessa prima dell'addebito (aumentano il debito)
                const scheduledDebt = transactions
                    .filter(t => 
                        t.status === 'scheduled' && 
                        t.accountId === card.id &&
                        isBefore(parseISO(t.date), paymentDate)
                    )
                    .reduce((acc, t) => acc + t.amount, 0); // Solo spese (uscite aumentano il debito da saldare)

                // SALDO PREVISTO ALLA DATA DELL'ADDEBITO
                const projectedBankBalance = bank.balance + scheduledFlow;
                const totalDebtAtPayment = currentDebt + scheduledDebt;

                // ANALISI DEL RISCHIO
                if (totalDebtAtPayment > 0) {
                    if (projectedBankBalance < totalDebtAtPayment) {
                        const missing = totalDebtAtPayment - projectedBankBalance;
                        alerts.push({
                            type: 'danger',
                            title: 'Rischio Insolvenza Carta',
                            message: `Il ${paymentDate.toLocaleDateString()}, dovrai saldare ${formatCurrency(totalDebtAtPayment)} per la carta "${card.name}". In base alle previsioni, sul conto "${bank.name}" mancheranno ${formatCurrency(missing)}.`,
                            icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        });
                    } else if (projectedBankBalance < totalDebtAtPayment * 1.1) {
                        alerts.push({
                            type: 'warning',
                            title: 'Liquidità a Rischio',
                            message: `Dopo aver saldato la carta "${card.name}" il ${paymentDate.toLocaleDateString()}, sul conto "${bank.name}" rimarranno appena ${formatCurrency(projectedBankBalance - totalDebtAtPayment)}.`,
                            icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        });
                    }
                }
            }
        } else if (currentDebt > 0) {
            // Warning se la carta non ha un conto associato
            alerts.push({
                type: 'warning',
                title: 'Configurazione Mancante',
                message: `La carta "${card.name}" ha un debito di ${formatCurrency(currentDebt)} ma non è collegata a nessun conto bancario per il saldo.`,
                icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            });
        }
    });

    // 2. ANALISI BUDGET (Invariata)
    budgets.forEach(b => {
        const spent = transactions
            .filter(t => t.type === 'expense' && t.category.toLowerCase() === b.category.toLowerCase())
            .reduce((sum, t) => sum + t.amount, 0);
        
        if (spent > b.limit) {
            alerts.push({
                type: 'danger',
                title: 'Budget Sforato',
                message: `Hai superato il limite di ${b.category} di ${formatCurrency(spent - b.limit)}.`,
                icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            });
        } else if (spent > b.limit * 0.85) {
            alerts.push({
                type: 'warning',
                title: 'Budget in Esaurimento',
                message: `Hai consumato l'85% del budget per ${b.category}.`,
                icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            });
        }
    });

    // 3. ANALISI OBIETTIVI (Invariata)
    const realLiquidity = accounts.filter(a => a.includeInTotal && a.type !== 'credit').reduce((sum, a) => sum + a.balance, 0);
    const creditDebt = accounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + Math.abs(a.balance), 0);
    const netLiquidity = realLiquidity - creditDebt;
    const goalsAllocated = goals.reduce((sum, g) => sum + g.current, 0);

    if (goalsAllocated > netLiquidity) {
        alerts.push({
            type: 'warning',
            title: 'Incoerenza Obiettivi',
            message: `Hai allocato ${formatCurrency(goalsAllocated)} negli obiettivi, ma la liquidità reale netta è solo ${formatCurrency(netLiquidity)}.`,
            icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        });
    }

    if (alerts.length === 0) return null;

    return (
        <div className="mb-8 grid gap-4">
            {alerts.map((alert, index) => (
                <div key={index} className={`p-4 rounded-xl border-l-4 flex items-start gap-4 shadow-md animate-fadeIn ${
                    alert.type === 'danger' 
                        ? 'bg-rose-50 border-rose-500 text-rose-900' 
                        : 'bg-amber-50 border-amber-400 text-amber-900'
                }`}>
                    <div className={`p-2 rounded-full flex-shrink-0 ${alert.type === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                        {alert.icon}
                    </div>
                    <div>
                        <h4 className="font-bold text-sm uppercase tracking-wide">{alert.title}</h4>
                        <p className="text-sm mt-1 leading-relaxed">{alert.message}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default FinancialInsights;