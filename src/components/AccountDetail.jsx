import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, writeBatch, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import AccountManager, { ACCOUNT_COLORS_MAP } from './AccountManager'; 
import { useAccounts } from '../hooks/useAccounts'; 

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

// --- COMPONENTE GRAFICO SVG (Leggero e veloce) ---
const BalanceChart = ({ data, colorHex }) => {
    if (!data || data.length < 2) return <div className="h-32 flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50 rounded-xl border border-dashed border-slate-200">Dati insufficienti per il grafico</div>;
    
    const width = 800; 
    const height = 200; 
    const padding = 20;
    
    const values = data.map(d => d.value); 
    const min = Math.min(...values); 
    const max = Math.max(...values); 
    const range = max - min || 1; // Evita divisione per zero

    // Coordinate
    const getY = (val) => height - padding - ((val - min) / range) * (height - (padding * 2));
    const getX = (index) => (index / (data.length - 1)) * width;
    
    const linePath = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' ');
    const areaPath = `${linePath} ${width},${height} 0,${height}`;
    
    // Colore stroke (default verde se non specificato)
    const strokeColor = colorHex || '#10b981';

    return (
        <div className="w-full h-48 overflow-hidden relative group">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {/* Area Sfumata */}
                <path d={`M0,${height} ${areaPath} Z`} fill="url(#chartGradient)" stroke="none" />
                {/* Linea */}
                <polyline points={linePath} fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            
            {/* Etichette Min/Max */}
            <div className="absolute top-2 left-2 text-[10px] font-bold text-slate-500 bg-white/80 px-2 py-1 rounded shadow-sm border border-slate-100 backdrop-blur-sm">Max: {formatCurrency(max)}</div>
            <div className="absolute bottom-2 left-2 text-[10px] font-bold text-slate-500 bg-white/80 px-2 py-1 rounded shadow-sm border border-slate-100 backdrop-blur-sm">Min: {formatCurrency(min)}</div>
        </div>
    );
};

function AccountDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const user = auth.currentUser;
    const { accounts } = useAccounts(user?.uid); 

    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [recurrings, setRecurrings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);

    // Fetch Data
    const fetchAccountData = async () => {
        try {
            const accRef = doc(db, 'accounts', id);
            const accSnap = await getDoc(accRef);
            if (!accSnap.exists()) { navigate('/profile'); return; }
            setAccount({ id: accSnap.id, ...accSnap.data() });

            // Fetch Transazioni (Ordinate per data decrescente: Oggi -> Passato)
            const qT = query(collection(db, 'transactions'), where('userId', '==', user.uid), orderBy('date', 'desc'));
            const tSnap = await getDocs(qT);
            const allT = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filtra solo quelle di questo conto
            const accountT = allT.filter(t => t.accountId === id || t.toAccountId === id);
            setTransactions(accountT);

            // Fetch Ricorrenze (future/programmate)
            setRecurrings(accountT.filter(t => t.isRecurring && t.status === 'scheduled'));
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    useEffect(() => {
        if (user && id) fetchAccountData();
    }, [user, id]);

    // --- LOGICA CALCOLO GRAFICO ---
    const chartData = useMemo(() => {
        if (!account || transactions.length === 0) return [];

        // 1. Prendiamo solo le transazioni passate/completate
        const pastTransactions = transactions.filter(t => t.status !== 'scheduled');
        
        // 2. Partiamo dal saldo attuale
        let currentBalance = account.balance;
        const historyPoints = [];

        // Aggiungiamo il punto "Oggi"
        historyPoints.push({ date: new Date(), value: currentBalance });

        // 3. Iteriamo le transazioni (che sono ordinate dalla più recente alla più vecchia)
        // Eseguiamo l'operazione INVERSA per trovare il saldo precedente
        pastTransactions.forEach(t => {
            const isExpense = (t.type === 'expense' || (t.type === 'transfer' && t.accountId === account.id));
            
            // Se era una spesa, prima avevo PIÙ soldi -> Aggiungo
            // Se era un'entrata, prima avevo MENO soldi -> Tolgo
            if (isExpense) {
                currentBalance += t.amount;
            } else {
                currentBalance -= t.amount;
            }
            historyPoints.push({ date: new Date(t.date), value: currentBalance });
        });

        // 4. Invertiamo l'array per avere l'ordine cronologico (Vecchio -> Nuovo) per il grafico
        // Prendiamo max ultimi 30-50 punti per leggibilità
        return historyPoints.slice(0, 50).reverse();
    }, [account, transactions]);

    // Handlers
    const handleCloseAccount = async () => {
        if (!window.confirm("Archiviare questo conto? Lo storico rimarrà visibile.")) return;
        try { await updateDoc(doc(db, 'accounts', id), { status: 'closed' }); fetchAccountData(); } catch (e) { alert("Errore: " + e.message); }
    };

    const handleReopenAccount = async () => {
        try { await updateDoc(doc(db, 'accounts', id), { status: 'active' }); fetchAccountData(); } catch (e) { alert("Errore: " + e.message); }
    };

    const handleDeleteAccount = async (deleteTransactions) => {
        if (!window.confirm(deleteTransactions ? "ATTENZIONE: Elimini conto E transazioni. Irreversibile." : "Elimini solo il conto.")) return;
        try {
            const batch = writeBatch(db);
            if (deleteTransactions) transactions.forEach(t => batch.delete(doc(db, 'transactions', t.id)));
            batch.delete(doc(db, 'accounts', id));
            await batch.commit();
            navigate('/profile');
        } catch (e) { alert("Errore: " + e.message); }
    };

    if (loading || !account) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Caricamento...</div>;

    // Risoluzione tema colore
    const theme = ACCOUNT_COLORS_MAP[account.color] || ACCOUNT_COLORS_MAP['blue'];
    const isClosed = account.status === 'closed';
    // Mapping colore per il grafico (estrai hex approssimativo dalle classi tailwind o usa mappa fissa)
    // Qui uso una mappa semplice basata sulle chiavi per dare il colore al grafico
    const CHART_COLORS = {
        emerald: '#059669', green: '#16a34a', lime: '#65a30d', blue: '#2563eb', 
        indigo: '#4f46e5', red: '#dc2626', orange: '#ea580c', amber: '#d97706',
        slate: '#475569', violet: '#7c3aed', pink: '#db2777', rose: '#e11d48',
        cyan: '#0891b2', teal: '#0d9488', sky: '#0284c7', fuchsia: '#c026d3',
        yellow: '#ca8a04', gold: '#ca8a04', navy: '#1e3a8a', forest: '#064e3b',
        onyx: '#0f172a', ivory: '#78716c'
    };
    const chartHex = CHART_COLORS[account.color] || '#4f46e5';
    const isLight = theme.text !== 'text-white';

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
            {/* HEADER CONTO */}
            <div className={`${theme.bg} ${theme.text} pb-12 pt-8 px-4 relative overflow-hidden transition-colors duration-500`}>
                {/* Decoro Background */}
                <div className={`absolute top-0 right-0 w-64 h-64 opacity-10 rounded-full -mr-16 -mt-16 pointer-events-none ${isLight ? 'bg-black' : 'bg-white'}`}></div>
                
                <div className="max-w-4xl mx-auto relative z-10">
                    <button onClick={() => navigate('/profile')} className={`mb-6 flex items-center gap-2 text-sm font-bold opacity-80 hover:opacity-100 transition`}>&larr; Torna al Profilo</button>
                    
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`text-xs font-bold uppercase tracking-wider opacity-80 border px-2 py-0.5 rounded ${isLight ? 'border-stone-400' : 'border-white/30'}`}>
                                    {account.type === 'credit' ? 'Carta di Credito' : 'Conto Corrente'}
                                </span>
                                {isClosed && <span className="text-xs font-bold bg-black/40 px-2 py-0.5 rounded text-rose-200">ARCHIVIATO</span>}
                            </div>
                            <h1 className="text-4xl font-bold">{account.name}</h1>
                            <p className="opacity-70 text-sm mt-1">{account.type === 'savings' ? `Interesse: ${account.interestRate}%` : 'Conto Ordinario'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium opacity-80 uppercase">Saldo Attuale</p>
                            <p className="text-4xl font-mono font-bold">{formatCurrency(account.balance)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 -mt-8 relative z-20 space-y-6">
                
                {/* CARD INFO & ACTIONS */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col md:flex-row gap-8 justify-between">
                    <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                            <h3 className="font-bold text-slate-700">Dettagli Conto</h3>
                            <button onClick={() => setShowEditModal(true)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 uppercase flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                Modifica Dati
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><p className="text-xs text-slate-400 uppercase font-bold">Data Apertura</p><p className="text-slate-800 font-medium mt-1">{account.createdAt ? format(new Date(account.createdAt), 'dd MMM yyyy', { locale: it }) : format(new Date(), 'dd MMM yyyy', { locale: it })}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase font-bold">Stato</p><p className={`font-medium mt-1 ${isClosed ? 'text-rose-600' : 'text-emerald-600'}`}>{isClosed ? 'Archiviato' : 'Attivo'}</p></div>
                        </div>
                    </div>

                    <div className="flex-1 border-l border-slate-100 pl-0 md:pl-8 space-y-4">
                         <h3 className="font-bold text-slate-700 border-b border-slate-50 pb-2">Azioni</h3>
                         <div className="flex flex-col gap-2">
                             {isClosed ? (
                                 <button onClick={handleReopenAccount} className="w-full py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg text-xs hover:bg-emerald-100 transition">RIATTIVA</button>
                             ) : (
                                 <button onClick={handleCloseAccount} className="w-full py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-200 transition">ARCHIVIA (Chiudi)</button>
                             )}
                             <div className="flex gap-2">
                                 <button onClick={() => handleDeleteAccount(false)} className="flex-1 py-2 border border-rose-200 text-rose-600 font-bold rounded-lg text-xs hover:bg-rose-50 transition">ELIMINA</button>
                                 <button onClick={() => handleDeleteAccount(true)} className="flex-1 py-2 bg-rose-600 text-white font-bold rounded-lg text-xs hover:bg-rose-700 transition" title="Elimina anche transazioni">ELIMINA + STORICO</button>
                             </div>
                         </div>
                    </div>
                </div>

                {/* --- NUOVO: GRAFICO ANDAMENTO --- */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-bold text-slate-700">Andamento Saldo</h3>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ultimi movimenti</span>
                    </div>
                    <div className="p-6">
                        <BalanceChart data={chartData} colorHex={chartHex} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* COLONNA SX: RICORRENZE */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                <span className="bg-indigo-100 p-1 rounded text-indigo-600">⚡️</span> Spese Fisse / PAC
                            </h3>
                            {recurrings.length > 0 ? (
                                <ul className="space-y-3">
                                    {recurrings.map(t => (
                                        <li key={t.id} className="text-sm border-b border-slate-50 pb-2 last:border-0">
                                            <div className="flex justify-between font-bold text-slate-700"><span>{t.description}</span><span>{formatCurrency(t.amount)}</span></div>
                                            <div className="text-xs text-slate-400 mt-0.5 flex justify-between">
                                                <span>Ogni {t.recurrenceRule?.includes('MONTHLY') ? 'Mese' : 'Settimana'}</span>
                                                <span className="text-emerald-600">Prox: {format(new Date(t.date), 'dd MMM')}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-xs text-slate-400 italic">Nessuna ricorrenza attiva.</p>}
                        </div>
                    </div>

                    {/* COLONNA DX: STORICO */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                            <h3 className="font-bold text-slate-700 mb-6">Ultimi Movimenti</h3>
                            <div className="overflow-y-auto max-h-[600px] custom-scrollbar">
                                {transactions.length > 0 ? (
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 sticky top-0"><tr><th className="py-2 px-3 text-xs font-bold text-slate-500 uppercase">Data</th><th className="py-2 px-3 text-xs font-bold text-slate-500 uppercase">Desc</th><th className="py-2 px-3 text-xs font-bold text-slate-500 uppercase text-right">€</th></tr></thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {transactions.map(t => {
                                                const isScheduled = t.status === 'scheduled';
                                                return (
                                                    <tr key={t.id} className={`hover:bg-slate-50/50 ${isScheduled ? 'bg-slate-50/30 italic text-slate-400' : ''}`}>
                                                        <td className="py-3 px-3 text-sm text-slate-500 whitespace-nowrap">
                                                            {format(new Date(t.date), 'dd MMM', { locale: it })}
                                                            {isScheduled && <span className="ml-2 text-[9px] bg-indigo-50 text-indigo-500 px-1 rounded border border-indigo-100">FUTURO</span>}
                                                        </td>
                                                        <td className="py-3 px-3 text-sm text-slate-700"><div className="font-medium">{t.description}</div></td>
                                                        <td className={`py-3 px-3 text-sm font-bold text-right ${t.type === 'income' || t.toAccountId === id ? 'text-emerald-600' : 'text-slate-700'}`}>{t.type === 'income' || t.toAccountId === id ? '+' : '-'} {formatCurrency(t.amount)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : <p className="text-center py-10 text-slate-400 italic">Nessun movimento.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALE DI MODIFICA */}
            {showEditModal && (
                <AccountManager 
                    user={user} 
                    accounts={accounts} 
                    accountToEdit={account} 
                    onClose={() => { setShowEditModal(false); fetchAccountData(); }} 
                />
            )}
        </div>
    );
}

export default AccountDetail;