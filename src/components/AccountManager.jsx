import React, { useState, useEffect } from 'react';
import { addDoc, updateDoc, doc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// --- MAPPA COLORI COMPLETA (Sincronizzata con Investments.jsx) ---
export const ACCOUNT_COLORS_MAP = {
    // 1. SCURI & PREMIUM
    onyx:    { bg: 'bg-slate-900', text: 'text-white', label: 'Onyx (Nero)' },
    navy:    { bg: 'bg-blue-900', text: 'text-white', label: 'Navy' },
    forest:  { bg: 'bg-emerald-900', text: 'text-white', label: 'Forest' },

    // 2. VIVACI & STANDARD
    blue:    { bg: 'bg-blue-600', text: 'text-white', label: 'Blu' },
    indigo:  { bg: 'bg-indigo-600', text: 'text-white', label: 'Indigo' },
    emerald: { bg: 'bg-emerald-600', text: 'text-white', label: 'Smeraldo' },
    teal:    { bg: 'bg-teal-600', text: 'text-white', label: 'Teal' },
    cyan:    { bg: 'bg-cyan-600', text: 'text-white', label: 'Ciano' },
    sky:     { bg: 'bg-sky-600', text: 'text-white', label: 'Sky' },
    violet:  { bg: 'bg-violet-600', text: 'text-white', label: 'Viola' },
    purple:  { bg: 'bg-purple-600', text: 'text-white', label: 'Purple' },
    fuchsia: { bg: 'bg-fuchsia-600', text: 'text-white', label: 'Fucsia' },
    pink:    { bg: 'bg-pink-600', text: 'text-white', label: 'Pink' },
    rose:    { bg: 'bg-rose-600', text: 'text-white', label: 'Rose' },

    // 3. CALDI & SOLARI
    gold:    { bg: 'bg-yellow-600', text: 'text-white', label: 'Oro' },
    amber:   { bg: 'bg-amber-500', text: 'text-white', label: 'Ambra' },
    orange:  { bg: 'bg-orange-500', text: 'text-white', label: 'Arancio' },
    red:     { bg: 'bg-red-600', text: 'text-white', label: 'Rosso' },
    lime:    { bg: 'bg-lime-600', text: 'text-white', label: 'Lime' },
    yellow:  { bg: 'bg-yellow-500', text: 'text-white', label: 'Giallo' },

    // 4. NEUTRI & SPECIALI
    ivory:   { bg: 'bg-[#F2F0E9]', text: 'text-stone-800', label: 'Avorio' }, // Testo scuro!
    stone:   { bg: 'bg-stone-500', text: 'text-white', label: 'Tortora' },
    slate:   { bg: 'bg-slate-500', text: 'text-white', label: 'Slate' },
    zinc:    { bg: 'bg-zinc-600', text: 'text-white', label: 'Zinc' },
    gray:    { bg: 'bg-gray-500', text: 'text-white', label: 'Grigio' },
    neutral: { bg: 'bg-neutral-600', text: 'text-white', label: 'Neutral' },
};

const getIconByType = (type) => {
    switch (type) {
        case 'credit': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
        case 'cash': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
        case 'savings': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        case 'investment': return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
        default: return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>;
    }
};

// Funzione helper locale per conversione
const convertToEur = (price, currency, rates) => {
    if (currency === 'EUR' || !rates) return price;
    if (!rates[currency]) return price; 
    return price / rates[currency];
};

function AccountManager({ user, accounts, accountToEdit, assets, exchangeRates, onClose }) {
    const [name, setName] = useState('');
    const [balance, setBalance] = useState(''); 
    const [type, setType] = useState('bank'); 
    const [colorId, setColorId] = useState('blue'); 
    const [includeInTotal, setIncludeInTotal] = useState(true);
    
    // Campi Opzionali
    const [creditLimit, setCreditLimit] = useState('');
    const [closingDay, setClosingDay] = useState('28');
    const [paymentDay, setPaymentDay] = useState('15');
    const [linkedBankId, setLinkedBankId] = useState('');
    const [interestRate, setInterestRate] = useState('');
    
    const [showColorPicker, setShowColorPicker] = useState(false);

    useEffect(() => {
        if (accountToEdit) {
            setName(accountToEdit.name);
            
            // Normalizza tipo
            const normType = accountToEdit.type === 'checking' ? 'bank' : accountToEdit.type;
            setType(normType);

            // Gestione Valore da Mostrare
            const valToShow = (normType === 'investment' && accountToEdit.cash !== undefined)
                ? accountToEdit.cash
                : accountToEdit.balance;
            setBalance(valToShow);

            // Se il colore salvato non esiste più nella nuova mappa, usa 'blue' come fallback
            const savedColor = accountToEdit.color;
            setColorId(ACCOUNT_COLORS_MAP[savedColor] ? savedColor : 'blue');
            
            setIncludeInTotal(accountToEdit.includeInTotal !== undefined ? accountToEdit.includeInTotal : true);
            
            setInterestRate(accountToEdit.interestRate || '');

            if (normType === 'credit') {
                setCreditLimit(accountToEdit.creditLimit || '');
                setClosingDay(accountToEdit.closingDay || '28');
                setPaymentDay(accountToEdit.paymentDay || '15');
                setLinkedBankId(accountToEdit.linkedBankId || '');
            }
        }
    }, [accountToEdit]);

    // Filtra sia bank che checking per retrocompatibilità
    const bankAccounts = accounts ? accounts.filter(a => (a.type === 'bank' || a.type === 'checking') && a.id !== accountToEdit?.id) : [];

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return;

        const inputVal = parseFloat(balance) || 0;

        const accountData = {
            userId: user.uid,
            name,
            type,
            color: colorId,
            includeInTotal,
            interestRate: (type === 'savings' || type === 'investment') ? parseFloat(interestRate) : null,
            creditLimit: type === 'credit' ? parseFloat(creditLimit) : null,
            closingDay: type === 'credit' ? parseInt(closingDay) : null,
            paymentDay: type === 'credit' ? parseInt(paymentDay) : null,
            linkedBankId: type === 'credit' ? linkedBankId : null,
            updatedAt: new Date().toISOString()
        };

        if (type === 'investment') {
            accountData.cash = inputVal;
            
            // FIX: Calcolo robusto del saldo totale (Cash + Assets)
            let currentAssetsVal = 0;
            
            // Se stiamo modificando e abbiamo la lista assets, usiamola per ricalcolare
            if (accountToEdit && assets && assets.length > 0) {
                const myAssets = assets.filter(a => a.accountId === accountToEdit.id);
                currentAssetsVal = myAssets.reduce((sum, a) => {
                    const price = parseFloat(a.currentPrice) || 0;
                    const qty = parseFloat(a.quantity) || 0;
                    return sum + (qty * convertToEur(price, a.currency || 'EUR', exchangeRates));
                }, 0);
            } else if (accountToEdit) {
                // Fallback (se per qualche motivo non abbiamo gli assets, usiamo il vecchio metodo differenziale)
                currentAssetsVal = (accountToEdit.balance || 0) - (accountToEdit.cash || 0);
                if (currentAssetsVal < 0) currentAssetsVal = 0;
            }

            accountData.balance = inputVal + currentAssetsVal;

        } else {
            accountData.balance = inputVal;
            accountData.cash = inputVal; 
        }

        try {
            if (accountToEdit) {
                await updateDoc(doc(db, 'accounts', accountToEdit.id), accountData);
            } else {
                await addDoc(collection(db, 'accounts'), { ...accountData, status: 'active', createdAt: new Date().toISOString() });
            }
            onClose();
        } catch (error) { console.error("Errore salvataggio:", error); }
    };

    const currentColor = ACCOUNT_COLORS_MAP[colorId] || ACCOUNT_COLORS_MAP['blue'];
    // Determina se il testo del selettore anteprima deve essere scuro o chiaro
    const previewTextColor = currentColor.text === 'text-white' ? 'text-white/90' : 'text-slate-600';

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">{accountToEdit ? 'Modifica Conto' : 'Nuovo Conto'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-rose-500 text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome Conto</label>
                                <input type="text" placeholder="Es. Intesa" className="input-field" value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{type === 'investment' ? 'Liquidità (Cash)' : type === 'credit' ? 'Saldo (Debito)' : 'Saldo'}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" placeholder="0.00 €" className="input-field font-mono" value={balance} onChange={e => setBalance(e.target.value)} required />
                                    {accountToEdit && <p className="text-[10px] text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 bg-white px-1">Modifica</p>}
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Tipo</label>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                {[{id: 'bank', label: 'Banca'}, {id: 'credit', label: 'Carta'}, {id: 'cash', label: 'Contanti'}, {id: 'savings', label: 'Risparmi'}, {id: 'investment', label: 'Invest'}].map(t => (
                                    <button 
                                        type="button" 
                                        key={t.id} 
                                        onClick={() => setType(t.id)} 
                                        className={`px-1 py-3 rounded-xl text-[10px] font-bold uppercase transition flex flex-col items-center gap-2 border-2 ${type === t.id ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200'}`}
                                    >
                                        <div className={type === t.id ? 'text-indigo-600' : 'text-slate-400'}>{getIconByType(t.id)}</div>{t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* CARTA DI CREDITO */}
                        {type === 'credit' && (
                           <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-fadeIn">
                               <h5 className="text-xs font-bold text-indigo-800 uppercase mb-3 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                    Configurazione Carta
                               </h5>
                               <div className="grid grid-cols-2 gap-4 mb-3">
                                   <div><label className="text-[10px] font-bold text-slate-500 uppercase">Plafond</label><input type="number" className="input-field text-sm" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} /></div>
                                   <div>
                                       <label className="text-[10px] font-bold text-slate-500 uppercase">Conto Addebito</label>
                                       <select className="input-field text-sm" value={linkedBankId} onChange={e => setLinkedBankId(e.target.value)}>
                                            <option value="">-- Seleziona --</option>
                                            {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                       </select>
                                       {bankAccounts.length === 0 && <p className="text-[9px] text-rose-500 mt-1">Nessun conto bancario disponibile.</p>}
                                   </div>
                               </div>
                               <div className="grid grid-cols-2 gap-4">
                                   <div><label className="text-[10px] font-bold text-slate-500 uppercase">Giorno Chiusura</label><input type="number" min="1" max="31" className="input-field text-sm" value={closingDay} onChange={e => setClosingDay(e.target.value)} /></div>
                                   <div><label className="text-[10px] font-bold text-slate-500 uppercase">Giorno Addebito</label><input type="number" min="1" max="31" className="input-field text-sm" value={paymentDay} onChange={e => setPaymentDay(e.target.value)} /></div>
                               </div>
                           </div>
                        )}

                        {/* INTERESSI */}
                        {(type === 'savings' || type === 'investment') && (
                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 animate-fadeIn">
                                <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Rendimento Annuo (%)</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" step="0.1" placeholder="3.5" className="input-field text-sm w-24 text-center border-emerald-200 focus:ring-emerald-500" value={interestRate} onChange={e => setInterestRate(e.target.value)} />
                                    <span className="text-sm text-emerald-600">% lordo</span>
                                </div>
                            </div>
                        )}

                        {/* COLORE */}
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Colore</label>
                            <div className="relative">
                                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl bg-slate-50">
                                    {/* Bottone Anteprima con gestione bordo per colori chiari */}
                                    <button 
                                        type="button" 
                                        onClick={() => setShowColorPicker(!showColorPicker)} 
                                        className={`w-10 h-10 rounded-full ${currentColor.bg} shadow-sm ring-2 ring-offset-2 ring-slate-300 flex items-center justify-center hover:scale-105 transition border border-black/5`}
                                    >
                                        <svg className={`w-4 h-4 ${previewTextColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                    <span className="text-sm text-slate-600">
                                        {currentColor.label || 'Colore selezionato'}
                                    </span>
                                </div>
                                {showColorPicker && (
                                    <div className="absolute top-full left-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-100 z-20 w-full grid grid-cols-6 sm:grid-cols-9 gap-2 animate-fadeIn max-h-60 overflow-y-auto custom-scrollbar">
                                        {Object.entries(ACCOUNT_COLORS_MAP).map(([key, val]) => (
                                            <button 
                                                type="button" 
                                                key={key} 
                                                onClick={() => { setColorId(key); setShowColorPicker(false); }} 
                                                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${val.bg} ${colorId === key ? 'ring-2 ring-offset-1 ring-slate-800' : ''} border border-slate-200 shadow-sm`} 
                                                title={val.label || key} 
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={includeInTotal} onChange={e => setIncludeInTotal(e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300" />
                                <span className="text-sm font-medium text-slate-700">Includi nel Patrimonio Totale</span>
                            </label>
                        </div>

                        <button type="submit" className="btn-primary py-3 w-full shadow-lg shadow-indigo-200">{accountToEdit ? 'Salva Modifiche' : 'Crea Conto'}</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default AccountManager;